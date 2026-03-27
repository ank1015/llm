import { apiRequestJson, SERVER_BASE } from './http';

import type { ArtifactContext } from './projects';
import type {
  CreateTerminalRequest,
  DeleteTerminalResponse,
  TerminalClientMessage,
  TerminalMetadataDto,
  TerminalResizeMessage,
  TerminalServerMessage,
  TerminalSummaryDto,
} from '@ank1015/llm-app-contracts';

function buildTerminalsBase(ctx: ArtifactContext): string {
  return `${SERVER_BASE}/api/projects/${encodeURIComponent(ctx.projectId)}/artifacts/${encodeURIComponent(ctx.artifactId)}/terminals`;
}

function buildTerminalPath(ctx: ArtifactContext, terminalId: string): string {
  return `${buildTerminalsBase(ctx)}/${encodeURIComponent(terminalId)}`;
}

function buildTerminalSocketUrl(input: OpenTerminalSocketRequest): string {
  const url = new URL(`${buildTerminalPath(input, input.terminalId)}/socket`);
  url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';

  if (typeof input.afterSeq === 'number' && Number.isFinite(input.afterSeq) && input.afterSeq > 0) {
    url.searchParams.set('afterSeq', `${Math.floor(input.afterSeq)}`);
  }

  return url.toString();
}

function parseTerminalServerMessage(rawData: unknown): TerminalServerMessage | null {
  if (typeof rawData !== 'string') {
    return null;
  }

  try {
    return JSON.parse(rawData) as TerminalServerMessage;
  } catch {
    return null;
  }
}

type TerminalSocketHandlers = {
  onOpen?: () => void;
  onMessage?: (message: TerminalServerMessage) => void;
  onClose?: (event: CloseEvent) => void;
  onError?: (error: Error) => void;
};

export type OpenTerminalSocketRequest = ArtifactContext & {
  terminalId: string;
  afterSeq?: number;
};

export type TerminalSocketConnection = {
  sendInput: (data: string) => void;
  sendResize: (input: Pick<TerminalResizeMessage, 'cols' | 'rows'>) => void;
  close: (code?: number, reason?: string) => void;
  readonly readyState: () => number;
};

export async function listTerminals(ctx: ArtifactContext): Promise<TerminalSummaryDto[]> {
  return apiRequestJson<TerminalSummaryDto[]>(buildTerminalsBase(ctx), {
    method: 'GET',
  });
}

export async function createTerminal(
  ctx: ArtifactContext,
  input?: CreateTerminalRequest
): Promise<TerminalMetadataDto> {
  return apiRequestJson<TerminalMetadataDto>(buildTerminalsBase(ctx), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input ?? {}),
  });
}

export async function getTerminal(
  ctx: ArtifactContext,
  terminalId: string
): Promise<TerminalMetadataDto> {
  return apiRequestJson<TerminalMetadataDto>(buildTerminalPath(ctx, terminalId), {
    method: 'GET',
  });
}

export async function deleteTerminal(
  ctx: ArtifactContext,
  terminalId: string
): Promise<DeleteTerminalResponse> {
  return apiRequestJson<DeleteTerminalResponse>(buildTerminalPath(ctx, terminalId), {
    method: 'DELETE',
  });
}

export function openTerminalSocket(
  input: OpenTerminalSocketRequest,
  handlers: TerminalSocketHandlers = {}
): TerminalSocketConnection {
  const socket = new WebSocket(buildTerminalSocketUrl(input));
  const pendingMessages: TerminalClientMessage[] = [];
  let closed = false;

  const flushPendingMessages = (): void => {
    while (pendingMessages.length > 0 && socket.readyState === WebSocket.OPEN) {
      const message = pendingMessages.shift();
      if (!message) {
        continue;
      }

      socket.send(JSON.stringify(message));
    }
  };

  const sendMessage = (message: TerminalClientMessage): void => {
    if (closed) {
      return;
    }

    if (socket.readyState === WebSocket.CONNECTING) {
      pendingMessages.push(message);
      return;
    }

    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(message));
  };

  socket.addEventListener('open', () => {
    flushPendingMessages();
    handlers.onOpen?.();
  });

  socket.addEventListener('message', (event) => {
    const parsed = parseTerminalServerMessage(event.data);
    if (!parsed) {
      handlers.onError?.(new Error('Received an invalid terminal socket message.'));
      return;
    }

    handlers.onMessage?.(parsed);
  });

  socket.addEventListener('close', (event) => {
    closed = true;
    handlers.onClose?.(event);
  });

  socket.addEventListener('error', () => {
    handlers.onError?.(new Error('Terminal socket connection failed.'));
  });

  return {
    sendInput: (data) => {
      sendMessage({
        type: 'input',
        data,
      });
    },
    sendResize: ({ cols, rows }) => {
      sendMessage({
        type: 'resize',
        cols,
        rows,
      });
    },
    close: (code, reason) => {
      closed = true;
      socket.close(code, reason);
    },
    readyState: () => socket.readyState,
  };
}

export type { TerminalSocketHandlers };
