"use client";

import { create } from "zustand";

import {
  createTerminal as createTerminalApi,
  deleteTerminal as deleteTerminalApi,
  listTerminals as listTerminalsApi,
  openTerminalSocket,
} from "@/lib/client-api";
import { getBrowserQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";

import type {
  ArtifactContext,
  CreateTerminalRequest,
  TerminalErrorMessage,
  TerminalExitMessage,
  TerminalMetadataDto,
  TerminalOutputMessage,
  TerminalServerMessage,
  TerminalSummaryDto,
} from "@/lib/client-api";

const DEFAULT_DOCK_HEIGHT_PX = 320;
const MIN_DOCK_HEIGHT_PX = 180;
const MAX_DOCK_HEIGHT_RATIO = 0.6;
const MAX_REPLAY_BYTES = 1_000_000;
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 2_000;
const FILESYSTEM_EPOCH_THROTTLE_MS = 1_500;

type TerminalConnectionState = "disconnected" | "connecting" | "connected" | "reconnecting";
type TerminalReplayFrame = TerminalOutputMessage | TerminalExitMessage | TerminalErrorMessage;

export type TerminalDockState = {
  open: boolean;
  heightPx: number;
  hasHydrated: boolean;
  isLoading: boolean;
  error: string | null;
  terminalIds: string[];
  activeTerminalId: string | null;
  lastHydratedAt: number | null;
  filesystemEpoch: number;
};

export type ArtifactTerminalRecord = TerminalSummaryDto & {
  cwdAtLaunch: string | null;
  shell: string | null;
  connectionState: TerminalConnectionState;
  socketError: string | null;
  lastSeq: number;
  bufferVersion: number;
  isDeleting: boolean;
};

type TerminalStoreState = {
  dockByArtifact: Record<string, TerminalDockState>;
  terminalsById: Record<string, ArtifactTerminalRecord>;
  activeArtifactKey: string | null;
  activateArtifact: (ctx: ArtifactContext) => Promise<void>;
  deactivateArtifact: (ctx: ArtifactContext) => void;
  setArtifactVisibility: (ctx: ArtifactContext, visible: boolean) => void;
  ensureHydrated: (ctx: ArtifactContext, force?: boolean) => Promise<void>;
  openDock: (ctx: ArtifactContext) => Promise<void>;
  closeDock: (ctx: ArtifactContext) => void;
  toggleDock: (ctx: ArtifactContext) => Promise<void>;
  setDockHeight: (ctx: ArtifactContext, heightPx: number, containerHeightPx?: number) => void;
  selectTerminal: (ctx: ArtifactContext, terminalId: string) => Promise<void>;
  createTerminal: (ctx: ArtifactContext, input?: CreateTerminalRequest) => Promise<string>;
  deleteTerminal: (ctx: ArtifactContext, terminalId: string) => Promise<void>;
  sendInput: (ctx: ArtifactContext, terminalId: string, data: string) => void;
  resizeTerminal: (ctx: ArtifactContext, terminalId: string, cols: number, rows: number) => void;
  clearDockError: (ctx: ArtifactContext) => void;
  reset: () => void;
};

const terminalSocketConnections = new Map<string, ReturnType<typeof openTerminalSocket>>();
const reconnectTimers = new Map<string, ReturnType<typeof setTimeout>>();
const reconnectAttempts = new Map<string, number>();
const intentionalSocketClosures = new Set<string>();
const replayFramesByTerminal = new Map<string, TerminalReplayFrame[]>();
const replayBytesByTerminal = new Map<string, number>();
const filesystemEpochTimers = new Map<string, ReturnType<typeof setTimeout>>();

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected terminal error.";
}

function createInitialDockState(): TerminalDockState {
  return {
    open: false,
    heightPx: DEFAULT_DOCK_HEIGHT_PX,
    hasHydrated: false,
    isLoading: false,
    error: null,
    terminalIds: [],
    activeTerminalId: null,
    lastHydratedAt: null,
    filesystemEpoch: 0,
  };
}

export function getTerminalArtifactKey(projectId: string, artifactId: string): string {
  return `${projectId}::${artifactId}`;
}

export function getTerminalRecordKey(
  ctx: ArtifactContext | { projectId: string; artifactId: string },
  terminalId: string,
): string {
  return `${getTerminalArtifactKey(ctx.projectId, ctx.artifactId)}::${terminalId}`;
}

function getArtifactDockState(
  state: Pick<TerminalStoreState, "dockByArtifact">,
  artifactKey: string,
): TerminalDockState {
  return state.dockByArtifact[artifactKey] ?? createInitialDockState();
}

function clampDockHeight(heightPx: number, containerHeightPx?: number): number {
  const maxHeight = containerHeightPx
    ? Math.max(MIN_DOCK_HEIGHT_PX, Math.floor(containerHeightPx * MAX_DOCK_HEIGHT_RATIO))
    : Number.POSITIVE_INFINITY;

  return Math.max(MIN_DOCK_HEIGHT_PX, Math.min(Math.floor(heightPx), maxHeight));
}

function createTerminalRecord(
  terminal: TerminalSummaryDto | TerminalMetadataDto,
): ArtifactTerminalRecord {
  const metadata = terminal as Partial<TerminalMetadataDto>;

  return {
    ...terminal,
    cwdAtLaunch: metadata.cwdAtLaunch ?? null,
    shell: metadata.shell ?? null,
    connectionState: "disconnected",
    socketError: null,
    lastSeq: 0,
    bufferVersion: 0,
    isDeleting: false,
  };
}

function mergeTerminalRecord(
  existing: ArtifactTerminalRecord | undefined,
  terminal: TerminalSummaryDto | TerminalMetadataDto,
): ArtifactTerminalRecord {
  if (!existing) {
    return createTerminalRecord(terminal);
  }

  const metadata = terminal as Partial<TerminalMetadataDto>;

  return {
    ...existing,
    ...terminal,
    cwdAtLaunch: metadata.cwdAtLaunch ?? existing.cwdAtLaunch ?? null,
    shell: metadata.shell ?? existing.shell ?? null,
  };
}

function getFrameByteLength(frame: TerminalReplayFrame): number {
  if (frame.type === "output") {
    return frame.data.length;
  }

  if (frame.type === "error") {
    return frame.message.length + frame.code.length;
  }

  return JSON.stringify(frame).length;
}

function clearReconnectTimer(terminalRecordKey: string): void {
  const timer = reconnectTimers.get(terminalRecordKey);
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  reconnectTimers.delete(terminalRecordKey);
}

function clearFilesystemEpochTimer(artifactKey: string): void {
  const timer = filesystemEpochTimers.get(artifactKey);
  if (!timer) {
    return;
  }

  clearTimeout(timer);
  filesystemEpochTimers.delete(artifactKey);
}

function toTerminalMetadata(record: ArtifactTerminalRecord): TerminalMetadataDto | null {
  if (!record.cwdAtLaunch || !record.shell) {
    return null;
  }

  return {
    ...record,
    cwdAtLaunch: record.cwdAtLaunch,
    shell: record.shell,
  };
}

function syncTerminalSummaryCache(ctx: ArtifactContext, summary: TerminalSummaryDto): void {
  const queryClient = getBrowserQueryClient();
  queryClient.setQueryData<TerminalSummaryDto[]>(queryKeys.terminals.list(ctx), (current) => {
    const previous = current ?? [];
    const index = previous.findIndex((terminal) => terminal.id === summary.id);

    if (index === -1) {
      return [...previous, summary];
    }

    const next = [...previous];
    next[index] = summary;
    return next;
  });
}

function syncTerminalRecordCache(ctx: ArtifactContext, record: ArtifactTerminalRecord): void {
  syncTerminalSummaryCache(ctx, record);

  const metadata = toTerminalMetadata(record);
  if (!metadata) {
    return;
  }

  getBrowserQueryClient().setQueryData(queryKeys.terminals.detail(ctx, record.id), metadata);
}

function removeTerminalFromCache(ctx: ArtifactContext, terminalId: string): void {
  const queryClient = getBrowserQueryClient();
  queryClient.setQueryData<TerminalSummaryDto[]>(queryKeys.terminals.list(ctx), (current) =>
    (current ?? []).filter((terminal) => terminal.id !== terminalId),
  );
  queryClient.removeQueries({ queryKey: queryKeys.terminals.detail(ctx, terminalId) });
}

function clearTransportForTerminal(
  terminalRecordKey: string,
  preserveReplay = true,
  syncState = true,
): void {
  clearReconnectTimer(terminalRecordKey);
  reconnectAttempts.delete(terminalRecordKey);
  intentionalSocketClosures.delete(terminalRecordKey);

  const connection = terminalSocketConnections.get(terminalRecordKey);
  if (connection) {
    intentionalSocketClosures.add(terminalRecordKey);
    terminalSocketConnections.delete(terminalRecordKey);
    connection.close(1000, "Terminal detached");
  }

  if (!preserveReplay) {
    replayFramesByTerminal.delete(terminalRecordKey);
    replayBytesByTerminal.delete(terminalRecordKey);
  }

  if (syncState) {
    useTerminalStore.setState((state) => {
      const existing = state.terminalsById[terminalRecordKey];
      if (!existing) {
        return state;
      }

      const nextRecord = {
        ...existing,
        connectionState: "disconnected" as const,
      };
      syncTerminalRecordCache(
        {
          projectId: nextRecord.projectId,
          artifactId: nextRecord.artifactId,
        },
        nextRecord,
      );

      return {
        terminalsById: {
          ...state.terminalsById,
          [terminalRecordKey]: nextRecord,
        },
      };
    });
  }
}

function clearTransportForArtifact(artifactKey: string): void {
  for (const terminalRecordKey of Array.from(terminalSocketConnections.keys())) {
    if (terminalRecordKey.startsWith(`${artifactKey}::`)) {
      clearTransportForTerminal(terminalRecordKey);
    }
  }

  for (const terminalRecordKey of Array.from(reconnectTimers.keys())) {
    if (terminalRecordKey.startsWith(`${artifactKey}::`)) {
      clearTransportForTerminal(terminalRecordKey);
    }
  }
}

function pushReplayFrame(terminalRecordKey: string, frame: TerminalReplayFrame): void {
  const frames = replayFramesByTerminal.get(terminalRecordKey) ?? [];
  frames.push(frame);

  let nextBytes = (replayBytesByTerminal.get(terminalRecordKey) ?? 0) + getFrameByteLength(frame);
  while (frames.length > 0 && nextBytes > MAX_REPLAY_BYTES) {
    const removed = frames.shift();
    if (!removed) {
      break;
    }

    nextBytes -= getFrameByteLength(removed);
  }

  replayFramesByTerminal.set(terminalRecordKey, frames);
  replayBytesByTerminal.set(terminalRecordKey, Math.max(0, nextBytes));
}

function scheduleFilesystemEpochBump(artifactKey: string): void {
  if (filesystemEpochTimers.has(artifactKey)) {
    return;
  }

  const timer = setTimeout(() => {
    filesystemEpochTimers.delete(artifactKey);
    useTerminalStore.setState((state) => {
      const dock = getArtifactDockState(state, artifactKey);
      return {
        dockByArtifact: {
          ...state.dockByArtifact,
          [artifactKey]: {
            ...dock,
            filesystemEpoch: dock.filesystemEpoch + 1,
          },
        },
      };
    });
  }, FILESYSTEM_EPOCH_THROTTLE_MS);

  filesystemEpochTimers.set(artifactKey, timer);
}

function pickDefaultTerminalId(
  terminalIds: string[],
  terminalsById: Record<string, ArtifactTerminalRecord>,
  artifactCtx: ArtifactContext,
): string | null {
  for (let index = terminalIds.length - 1; index >= 0; index -= 1) {
    const terminalId = terminalIds[index];
    if (!terminalId) {
      continue;
    }

    const record = terminalsById[getTerminalRecordKey(artifactCtx, terminalId)];
    if (record?.status === "running") {
      return terminalId;
    }
  }

  return terminalIds[terminalIds.length - 1] ?? null;
}

function pickFallbackTerminalId(terminalIds: string[], closedTerminalId: string): string | null {
  const closedIndex = terminalIds.findIndex((terminalId) => terminalId === closedTerminalId);
  if (closedIndex === -1) {
    return terminalIds[0] ?? null;
  }

  for (let index = closedIndex + 1; index < terminalIds.length; index += 1) {
    const candidate = terminalIds[index];
    if (candidate) {
      return candidate;
    }
  }

  for (let index = closedIndex - 1; index >= 0; index -= 1) {
    const candidate = terminalIds[index];
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function shouldReconnectTerminal(terminalRecordKey: string): boolean {
  const state = useTerminalStore.getState();
  const terminal = state.terminalsById[terminalRecordKey];
  if (!terminal || terminal.status !== "running") {
    return false;
  }

  const artifactKey = getTerminalArtifactKey(terminal.projectId, terminal.artifactId);
  const dock = getArtifactDockState(state, artifactKey);
  if (state.activeArtifactKey !== artifactKey || !dock.open || dock.activeTerminalId !== terminal.id) {
    return false;
  }

  if (typeof document !== "undefined" && document.visibilityState !== "visible") {
    return false;
  }

  return true;
}

function scheduleTerminalReconnect(terminalRecordKey: string): void {
  if (reconnectTimers.has(terminalRecordKey)) {
    return;
  }

  const terminal = useTerminalStore.getState().terminalsById[terminalRecordKey];
  if (!terminal) {
    return;
  }

  const attempt = (reconnectAttempts.get(terminalRecordKey) ?? 0) + 1;
  reconnectAttempts.set(terminalRecordKey, attempt);
  const delay = Math.min(RECONNECT_MAX_DELAY_MS, RECONNECT_BASE_DELAY_MS * 2 ** (attempt - 1));

  const timer = setTimeout(() => {
    reconnectTimers.delete(terminalRecordKey);
    attachTerminalSocket(
      {
        projectId: terminal.projectId,
        artifactId: terminal.artifactId,
      },
      terminal.id,
    );
  }, delay);

  reconnectTimers.set(terminalRecordKey, timer);
}

function attachTerminalSocket(ctx: ArtifactContext, terminalId: string): void {
  const state = useTerminalStore.getState();
  const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
  const dock = getArtifactDockState(state, artifactKey);
  const terminalRecordKey = getTerminalRecordKey(ctx, terminalId);
  const terminal = state.terminalsById[terminalRecordKey];

  if (!terminal || state.activeArtifactKey !== artifactKey || !dock.open || dock.activeTerminalId !== terminalId) {
    return;
  }

  for (const candidateId of dock.terminalIds) {
    if (candidateId !== terminalId) {
      clearTransportForTerminal(getTerminalRecordKey(ctx, candidateId));
    }
  }

  if (terminalSocketConnections.has(terminalRecordKey)) {
    return;
  }

  clearReconnectTimer(terminalRecordKey);

  useTerminalStore.setState((currentState) => {
    const existing = currentState.terminalsById[terminalRecordKey] ?? terminal;
    const nextRecord = {
      ...existing,
      connectionState: reconnectAttempts.has(terminalRecordKey)
        ? "reconnecting"
        : "connecting",
      socketError: null,
    } satisfies ArtifactTerminalRecord;
    syncTerminalRecordCache(ctx, nextRecord);

    return {
      terminalsById: {
        ...currentState.terminalsById,
        [terminalRecordKey]: nextRecord,
      },
    };
  });

  const connection = openTerminalSocket(
    {
      projectId: ctx.projectId,
      artifactId: ctx.artifactId,
      terminalId,
      afterSeq: terminal.lastSeq > 0 ? terminal.lastSeq : undefined,
    },
    {
      onMessage: (message: TerminalServerMessage) => {
        if (message.type === "ready") {
          reconnectAttempts.delete(terminalRecordKey);
          useTerminalStore.setState((currentState) => {
            const nextRecord = {
              ...mergeTerminalRecord(
                currentState.terminalsById[terminalRecordKey],
                message.terminal,
              ),
              connectionState: "connected" as const,
              socketError: null,
            };
            syncTerminalRecordCache(ctx, nextRecord);

            return {
              terminalsById: {
                ...currentState.terminalsById,
                [terminalRecordKey]: nextRecord,
              },
            };
          });
          return;
        }

        if (message.type === "output") {
          pushReplayFrame(terminalRecordKey, message);
          scheduleFilesystemEpochBump(artifactKey);
          useTerminalStore.setState((currentState) => {
            const existing = currentState.terminalsById[terminalRecordKey];
            if (!existing) {
              return currentState;
            }

            const nextRecord = {
              ...existing,
              lastSeq: message.seq,
              bufferVersion: existing.bufferVersion + 1,
              lastActiveAt: new Date().toISOString(),
              socketError: null,
            };
            syncTerminalRecordCache(ctx, nextRecord);

            return {
              terminalsById: {
                ...currentState.terminalsById,
                [terminalRecordKey]: nextRecord,
              },
            };
          });
          return;
        }

        if (message.type === "error") {
          pushReplayFrame(terminalRecordKey, message);
          useTerminalStore.setState((currentState) => {
            const existing = currentState.terminalsById[terminalRecordKey];
            if (!existing) {
              return currentState;
            }

            const nextRecord = {
              ...existing,
              lastSeq: message.seq,
              bufferVersion: existing.bufferVersion + 1,
              socketError: message.message,
            };
            syncTerminalRecordCache(ctx, nextRecord);

            return {
              terminalsById: {
                ...currentState.terminalsById,
                [terminalRecordKey]: nextRecord,
              },
            };
          });
          return;
        }

        pushReplayFrame(terminalRecordKey, message);
        scheduleFilesystemEpochBump(artifactKey);
        useTerminalStore.setState((currentState) => {
          const existing = currentState.terminalsById[terminalRecordKey];
          if (!existing) {
            return currentState;
          }

          const nextRecord = {
            ...existing,
            status: "exited" as const,
            exitCode: message.exitCode,
            signal: message.signal,
            exitedAt: message.exitedAt,
            lastSeq: message.seq,
            bufferVersion: existing.bufferVersion + 1,
            connectionState: "disconnected" as const,
            socketError: null,
          };
          syncTerminalRecordCache(ctx, nextRecord);

          return {
            terminalsById: {
              ...currentState.terminalsById,
              [terminalRecordKey]: nextRecord,
            },
          };
        });
      },
      onClose: () => {
        const currentConnection = terminalSocketConnections.get(terminalRecordKey);
        if (currentConnection === connection) {
          terminalSocketConnections.delete(terminalRecordKey);
        }

        const wasIntentional = intentionalSocketClosures.delete(terminalRecordKey);
        useTerminalStore.setState((currentState) => {
          const existing = currentState.terminalsById[terminalRecordKey];
          if (!existing) {
            return currentState;
          }

          const nextRecord = {
            ...existing,
            connectionState: "disconnected" as const,
          };
          syncTerminalRecordCache(ctx, nextRecord);

          return {
            terminalsById: {
              ...currentState.terminalsById,
              [terminalRecordKey]: nextRecord,
            },
          };
        });

        if (!wasIntentional && shouldReconnectTerminal(terminalRecordKey)) {
          scheduleTerminalReconnect(terminalRecordKey);
        }
      },
      onError: (error) => {
        useTerminalStore.setState((currentState) => {
          const existing = currentState.terminalsById[terminalRecordKey];
          if (!existing) {
            return currentState;
          }

          const nextRecord = {
            ...existing,
            socketError: error.message,
          };
          syncTerminalRecordCache(ctx, nextRecord);

          return {
            terminalsById: {
              ...currentState.terminalsById,
              [terminalRecordKey]: nextRecord,
            },
          };
        });
      },
    },
  );

  terminalSocketConnections.set(terminalRecordKey, connection);
}

export function getTerminalReplayFrames(
  ctx: ArtifactContext | { projectId: string; artifactId: string },
  terminalId: string,
): TerminalReplayFrame[] {
  return replayFramesByTerminal.get(getTerminalRecordKey(ctx, terminalId)) ?? [];
}

export const useTerminalStore = create<TerminalStoreState>((set, get) => ({
  dockByArtifact: {},
  terminalsById: {},
  activeArtifactKey: null,

  activateArtifact: async (ctx) => {
    const nextArtifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
    const previousArtifactKey = get().activeArtifactKey;
    if (previousArtifactKey && previousArtifactKey !== nextArtifactKey) {
      clearTransportForArtifact(previousArtifactKey);
    }

    set((state) => ({
      activeArtifactKey: nextArtifactKey,
      dockByArtifact: {
        ...state.dockByArtifact,
        [nextArtifactKey]: getArtifactDockState(state, nextArtifactKey),
      },
    }));

    await get().ensureHydrated(ctx);

    const dock = getArtifactDockState(get(), nextArtifactKey);
    if (dock.open && dock.activeTerminalId) {
      attachTerminalSocket(ctx, dock.activeTerminalId);
    }
  },

  deactivateArtifact: (ctx) => {
    const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
    clearTransportForArtifact(artifactKey);

    if (get().activeArtifactKey === artifactKey) {
      set({ activeArtifactKey: null });
    }
  },

  setArtifactVisibility: (ctx, visible) => {
    const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
    if (get().activeArtifactKey !== artifactKey) {
      return;
    }

    if (!visible) {
      clearTransportForArtifact(artifactKey);
      return;
    }

    const dock = getArtifactDockState(get(), artifactKey);
    if (dock.open && dock.activeTerminalId) {
      attachTerminalSocket(ctx, dock.activeTerminalId);
    }
  },

  ensureHydrated: async (ctx, force = false) => {
    const queryClient = getBrowserQueryClient();
    const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
    const dock = getArtifactDockState(get(), artifactKey);
    if (dock.hasHydrated && !force) {
      return;
    }

    set((state) => ({
      dockByArtifact: {
        ...state.dockByArtifact,
        [artifactKey]: {
          ...getArtifactDockState(state, artifactKey),
          isLoading: true,
          error: null,
        },
      },
    }));

    try {
      if (force) {
        await queryClient.invalidateQueries({ queryKey: queryKeys.terminals.list(ctx) });
      }

      const terminals = await queryClient.fetchQuery({
        queryKey: queryKeys.terminals.list(ctx),
        queryFn: () => listTerminalsApi(ctx),
      });

      set((state) => {
        const previousDock = getArtifactDockState(state, artifactKey);
        const terminalIds = terminals.map((terminal) => terminal.id);
        const nextTerminalsById = { ...state.terminalsById };
        const previousTerminalIds = new Set(previousDock.terminalIds);

        for (const terminal of terminals) {
          const terminalRecordKey = getTerminalRecordKey(ctx, terminal.id);
          const nextRecord = mergeTerminalRecord(nextTerminalsById[terminalRecordKey], terminal);
          nextTerminalsById[terminalRecordKey] = nextRecord;
          syncTerminalSummaryCache(ctx, nextRecord);
          previousTerminalIds.delete(terminal.id);
        }

        for (const previousTerminalId of previousTerminalIds) {
          delete nextTerminalsById[getTerminalRecordKey(ctx, previousTerminalId)];
          clearTransportForTerminal(getTerminalRecordKey(ctx, previousTerminalId), false, false);
          removeTerminalFromCache(ctx, previousTerminalId);
        }

        const activeTerminalId = terminalIds.includes(previousDock.activeTerminalId ?? "")
          ? previousDock.activeTerminalId
          : pickDefaultTerminalId(terminalIds, nextTerminalsById, ctx);

        return {
          terminalsById: nextTerminalsById,
          dockByArtifact: {
            ...state.dockByArtifact,
            [artifactKey]: {
              ...previousDock,
              terminalIds,
              activeTerminalId,
              hasHydrated: true,
              isLoading: false,
              error: null,
              lastHydratedAt: Date.now(),
            },
          },
        };
      });
    } catch (error) {
      set((state) => ({
        dockByArtifact: {
          ...state.dockByArtifact,
          [artifactKey]: {
            ...getArtifactDockState(state, artifactKey),
            hasHydrated: true,
            isLoading: false,
            error: toErrorMessage(error),
          },
        },
      }));
      throw error;
    }
  },

  openDock: async (ctx) => {
    const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);

    set((state) => ({
      dockByArtifact: {
        ...state.dockByArtifact,
        [artifactKey]: {
          ...getArtifactDockState(state, artifactKey),
          open: true,
          error: null,
        },
      },
    }));

    await get().ensureHydrated(ctx);

    const dock = getArtifactDockState(get(), artifactKey);
    if (dock.terminalIds.length === 0) {
      await get().createTerminal(ctx);
      return;
    }

    const activeTerminalId =
      dock.activeTerminalId ?? pickDefaultTerminalId(dock.terminalIds, get().terminalsById, ctx);
    if (activeTerminalId) {
      set((state) => ({
        dockByArtifact: {
          ...state.dockByArtifact,
          [artifactKey]: {
            ...getArtifactDockState(state, artifactKey),
            open: true,
            activeTerminalId,
          },
        },
      }));

      if (get().activeArtifactKey === artifactKey) {
        attachTerminalSocket(ctx, activeTerminalId);
      }
    }
  },

  closeDock: (ctx) => {
    const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
    clearTransportForArtifact(artifactKey);

    set((state) => ({
      dockByArtifact: {
        ...state.dockByArtifact,
        [artifactKey]: {
          ...getArtifactDockState(state, artifactKey),
          open: false,
        },
      },
    }));
  },

  toggleDock: async (ctx) => {
    const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
    const dock = getArtifactDockState(get(), artifactKey);

    if (dock.open) {
      get().closeDock(ctx);
      return;
    }

    await get().openDock(ctx);
  },

  setDockHeight: (ctx, heightPx, containerHeightPx) => {
    const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
    set((state) => ({
      dockByArtifact: {
        ...state.dockByArtifact,
        [artifactKey]: {
          ...getArtifactDockState(state, artifactKey),
          heightPx: clampDockHeight(heightPx, containerHeightPx),
        },
      },
    }));
  },

  selectTerminal: async (ctx, terminalId) => {
    const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
    const dock = getArtifactDockState(get(), artifactKey);
    if (!dock.terminalIds.includes(terminalId)) {
      return;
    }

    clearTransportForArtifact(artifactKey);
    set((state) => ({
      dockByArtifact: {
        ...state.dockByArtifact,
        [artifactKey]: {
          ...getArtifactDockState(state, artifactKey),
          activeTerminalId: terminalId,
        },
      },
    }));

    if (get().activeArtifactKey === artifactKey && getArtifactDockState(get(), artifactKey).open) {
      attachTerminalSocket(ctx, terminalId);
    }
  },

  createTerminal: async (ctx, input) => {
    const queryClient = getBrowserQueryClient();
    const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
    set((state) => ({
      dockByArtifact: {
        ...state.dockByArtifact,
        [artifactKey]: {
          ...getArtifactDockState(state, artifactKey),
          error: null,
          open: true,
        },
      },
    }));

    try {
      const metadata = await createTerminalApi(ctx, input);
      queryClient.setQueryData(queryKeys.terminals.detail(ctx, metadata.id), metadata);
      syncTerminalSummaryCache(ctx, metadata);

      set((state) => {
        const previousDock = getArtifactDockState(state, artifactKey);
        const nextTerminalIds = [...previousDock.terminalIds, metadata.id];
        const nextRecord = mergeTerminalRecord(
          state.terminalsById[getTerminalRecordKey(ctx, metadata.id)],
          metadata,
        );
        syncTerminalRecordCache(ctx, nextRecord);

        return {
          terminalsById: {
            ...state.terminalsById,
            [getTerminalRecordKey(ctx, metadata.id)]: nextRecord,
          },
          dockByArtifact: {
            ...state.dockByArtifact,
            [artifactKey]: {
              ...previousDock,
              open: true,
              error: null,
              hasHydrated: true,
              terminalIds: nextTerminalIds,
              activeTerminalId: metadata.id,
              lastHydratedAt: Date.now(),
            },
          },
        };
      });

      await queryClient.invalidateQueries({ queryKey: queryKeys.terminals.list(ctx) });

      if (get().activeArtifactKey === artifactKey) {
        attachTerminalSocket(ctx, metadata.id);
      }

      return metadata.id;
    } catch (error) {
      set((state) => ({
        dockByArtifact: {
          ...state.dockByArtifact,
          [artifactKey]: {
            ...getArtifactDockState(state, artifactKey),
            error: toErrorMessage(error),
          },
        },
      }));
      throw error;
    }
  },

  deleteTerminal: async (ctx, terminalId) => {
    const queryClient = getBrowserQueryClient();
    const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
    const terminalRecordKey = getTerminalRecordKey(ctx, terminalId);

    set((state) => {
      const existing = state.terminalsById[terminalRecordKey];
      if (!existing) {
        return state;
      }

      const nextRecord = {
        ...existing,
        isDeleting: true,
      };
      syncTerminalRecordCache(ctx, nextRecord);

      return {
        terminalsById: {
          ...state.terminalsById,
          [terminalRecordKey]: nextRecord,
        },
      };
    });

    clearTransportForTerminal(terminalRecordKey);

    try {
      await deleteTerminalApi(ctx, terminalId);
      removeTerminalFromCache(ctx, terminalId);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.terminals.list(ctx) }),
        queryClient.invalidateQueries({ queryKey: queryKeys.terminals.detail(ctx, terminalId) }),
      ]);
    } catch (error) {
      set((state) => {
        const existing = state.terminalsById[terminalRecordKey];
        if (!existing) {
          return {
            dockByArtifact: {
              ...state.dockByArtifact,
              [artifactKey]: {
                ...getArtifactDockState(state, artifactKey),
                error: toErrorMessage(error),
              },
            },
          };
        }

        const nextRecord = {
          ...existing,
          isDeleting: false,
        };
        syncTerminalRecordCache(ctx, nextRecord);

        return {
          terminalsById: {
            ...state.terminalsById,
            [terminalRecordKey]: nextRecord,
          },
          dockByArtifact: {
            ...state.dockByArtifact,
            [artifactKey]: {
              ...getArtifactDockState(state, artifactKey),
              error: toErrorMessage(error),
            },
          },
        };
      });

      const dock = getArtifactDockState(get(), artifactKey);
      if (dock.open && dock.activeTerminalId && get().activeArtifactKey === artifactKey) {
        attachTerminalSocket(ctx, dock.activeTerminalId);
      }

      throw error;
    }

    set((state) => {
      const previousDock = getArtifactDockState(state, artifactKey);
      const nextTerminalIds = previousDock.terminalIds.filter((id) => id !== terminalId);
      const nextTerminalsById = { ...state.terminalsById };
      delete nextTerminalsById[terminalRecordKey];

      const nextActiveTerminalId =
        previousDock.activeTerminalId === terminalId
          ? pickFallbackTerminalId(previousDock.terminalIds, terminalId)
          : previousDock.activeTerminalId;

      return {
        terminalsById: nextTerminalsById,
        dockByArtifact: {
          ...state.dockByArtifact,
          [artifactKey]: {
            ...previousDock,
            error: null,
            open: nextTerminalIds.length > 0 ? previousDock.open : false,
            terminalIds: nextTerminalIds,
            activeTerminalId: nextActiveTerminalId,
          },
        },
      };
    });

    clearTransportForTerminal(terminalRecordKey, false, false);

    const nextDock = getArtifactDockState(get(), artifactKey);
    if (nextDock.open && nextDock.activeTerminalId && get().activeArtifactKey === artifactKey) {
      attachTerminalSocket(ctx, nextDock.activeTerminalId);
    }
  },

  sendInput: (ctx, terminalId, data) => {
    const connection = terminalSocketConnections.get(getTerminalRecordKey(ctx, terminalId));
    connection?.sendInput(data);
  },

  resizeTerminal: (ctx, terminalId, cols, rows) => {
    const terminalRecordKey = getTerminalRecordKey(ctx, terminalId);
    set((state) => {
      const existing = state.terminalsById[terminalRecordKey];
      if (!existing) {
        return state;
      }

      const nextRecord = {
        ...existing,
        cols,
        rows,
      };
      syncTerminalRecordCache(ctx, nextRecord);

      return {
        terminalsById: {
          ...state.terminalsById,
          [terminalRecordKey]: nextRecord,
        },
      };
    });

    terminalSocketConnections.get(terminalRecordKey)?.sendResize({ cols, rows });
  },

  clearDockError: (ctx) => {
    const artifactKey = getTerminalArtifactKey(ctx.projectId, ctx.artifactId);
    set((state) => ({
      dockByArtifact: {
        ...state.dockByArtifact,
        [artifactKey]: {
          ...getArtifactDockState(state, artifactKey),
          error: null,
        },
      },
    }));
  },

  reset: () => {
    for (const artifactKey of Array.from(filesystemEpochTimers.keys())) {
      clearFilesystemEpochTimer(artifactKey);
    }

    for (const terminalRecordKey of Array.from(terminalSocketConnections.keys())) {
      clearTransportForTerminal(terminalRecordKey, false);
    }

    reconnectTimers.clear();
    reconnectAttempts.clear();
    intentionalSocketClosures.clear();
    replayFramesByTerminal.clear();
    replayBytesByTerminal.clear();
    filesystemEpochTimers.clear();

    set({
      dockByArtifact: {},
      terminalsById: {},
      activeArtifactKey: null,
    });
  },
}));
