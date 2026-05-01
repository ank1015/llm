import { apiRequestJson, SERVER_BASE } from './http';

import type {
  SetupAgentCancelResponse,
  SetupAgentDoneEventData,
  SetupAgentErrorEventData,
  SetupAgentEventData,
  SetupAgentReadyEventData,
  SetupAgentStartResponse,
  SetupCompleteResult,
  SetupStatus,
} from '@ank1015/llm-server/contracts';

const SETUP_BASE = `${SERVER_BASE}/api/setup`;

export type SetupAgentStreamEventMap = {
  ready: SetupAgentReadyEventData;
  agent_event: SetupAgentEventData;
  done: SetupAgentDoneEventData;
  error: SetupAgentErrorEventData;
};

export type SetupAgentStreamEventName = keyof SetupAgentStreamEventMap;

export type SetupAgentStreamHandlers = {
  onEvent?: <TEvent extends SetupAgentStreamEventName>(
    eventName: TEvent,
    data: SetupAgentStreamEventMap[TEvent],
  ) => void;
};

export async function getSetupStatus(): Promise<SetupStatus> {
  return apiRequestJson<SetupStatus>(`${SETUP_BASE}/status`, {
    method: 'GET',
  });
}

export async function completeSetup(): Promise<SetupCompleteResult> {
  return apiRequestJson<SetupCompleteResult>(`${SETUP_BASE}/complete`, {
    method: 'POST',
  });
}

export async function startSetupAgent(): Promise<SetupAgentStartResponse> {
  return apiRequestJson<SetupAgentStartResponse>(`${SETUP_BASE}/agent/start`, {
    method: 'POST',
  });
}

export async function cancelSetupAgentRun(runId: string): Promise<SetupAgentCancelResponse> {
  return apiRequestJson<SetupAgentCancelResponse>(
    `${SETUP_BASE}/agent/runs/${encodeURIComponent(runId)}/cancel`,
    {
      method: 'POST',
    },
  );
}

export async function streamSetupAgentRun(
  runId: string,
  handlers: SetupAgentStreamHandlers = {},
  signal?: AbortSignal,
): Promise<void> {
  const response = await fetch(`${SETUP_BASE}/agent/runs/${encodeURIComponent(runId)}/stream`, {
    method: 'GET',
    headers: { Accept: 'text/event-stream' },
    signal,
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed: ${response.status}`);
  }

  const stream = response.body;
  if (!stream) {
    throw new Error('Missing stream body from server.');
  }

  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }

      buffer += normalizeSseChunk(decoder.decode(value, { stream: true }));

      while (true) {
        const boundary = buffer.indexOf('\n\n');
        if (boundary === -1) {
          break;
        }

        const block = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);

        const parsed = parseSseBlock(block);
        if (!parsed) {
          continue;
        }

        if (parsed.event === 'ready') {
          handlers.onEvent?.('ready', parsed.data as SetupAgentStreamEventMap['ready']);
          continue;
        }

        if (parsed.event === 'agent_event') {
          handlers.onEvent?.(
            'agent_event',
            parsed.data as SetupAgentStreamEventMap['agent_event'],
          );
          continue;
        }

        if (parsed.event === 'done') {
          handlers.onEvent?.('done', parsed.data as SetupAgentStreamEventMap['done']);
          continue;
        }

        if (parsed.event === 'error') {
          const data = parsed.data as SetupAgentStreamEventMap['error'];
          handlers.onEvent?.('error', data);
          throw new Error(data.message);
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

function normalizeSseChunk(value: string): string {
  return value.replaceAll('\r\n', '\n');
}

function parseSseBlock(block: string): { event: string; data: unknown } | null {
  if (!block.trim() || block.startsWith(':')) {
    return null;
  }

  let event = 'message';
  const dataLines: string[] = [];

  for (const line of block.split('\n')) {
    if (line.startsWith('event:')) {
      event = line.slice('event:'.length).trim();
      continue;
    }

    if (line.startsWith('data:')) {
      dataLines.push(line.slice('data:'.length).trimStart());
    }
  }

  if (dataLines.length === 0) {
    return null;
  }

  try {
    return {
      event,
      data: JSON.parse(dataLines.join('\n')) as unknown,
    };
  } catch {
    return null;
  }
}
