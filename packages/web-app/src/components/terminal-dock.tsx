'use client';

import { Loader2, Plus, Terminal as TerminalIcon, X } from 'lucide-react';
import { useParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

import { TerminalSurface } from '@/components/terminal-surface';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import {
  getTerminalArtifactKey,
  getTerminalRecordKey,
  type TerminalDockState,
  useTerminalStore,
} from '@/stores/terminals-store';

const EMPTY_DOCK_STATE: TerminalDockState = {
  open: false,
  heightPx: 320,
  hasHydrated: false,
  isLoading: false,
  error: null,
  terminalIds: [],
  activeTerminalId: null,
  lastHydratedAt: null,
  filesystemEpoch: 0,
};

function getConnectionLabel(
  connectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting',
  status: 'running' | 'exited'
): string {
  if (status === 'exited') {
    return 'Exited';
  }

  if (connectionState === 'reconnecting') {
    return 'Reconnecting';
  }

  if (connectionState === 'connecting') {
    return 'Connecting';
  }

  if (connectionState === 'connected') {
    return 'Connected';
  }

  return 'Detached';
}

export function ArtifactTerminalDock() {
  const { projectId, artifactId } = useParams<{ projectId: string; artifactId?: string }>();
  const artifactCtx = useMemo(
    () => (artifactId ? { projectId, artifactId } : null),
    [artifactId, projectId]
  );
  const artifactKey = useMemo(
    () => (artifactId ? getTerminalArtifactKey(projectId, artifactId) : null),
    [artifactId, projectId]
  );
  const hostRef = useRef<HTMLDivElement>(null);

  const dock = useTerminalStore((state) =>
    artifactKey ? (state.dockByArtifact[artifactKey] ?? EMPTY_DOCK_STATE) : EMPTY_DOCK_STATE
  );
  const terminalsById = useTerminalStore((state) => state.terminalsById);
  const activateArtifact = useTerminalStore((state) => state.activateArtifact);
  const deactivateArtifact = useTerminalStore((state) => state.deactivateArtifact);
  const setArtifactVisibility = useTerminalStore((state) => state.setArtifactVisibility);
  const toggleDock = useTerminalStore((state) => state.toggleDock);
  const createTerminal = useTerminalStore((state) => state.createTerminal);
  const deleteTerminal = useTerminalStore((state) => state.deleteTerminal);
  const selectTerminal = useTerminalStore((state) => state.selectTerminal);
  const setDockHeight = useTerminalStore((state) => state.setDockHeight);
  const clearDockError = useTerminalStore((state) => state.clearDockError);

  const [isResizing, setIsResizing] = useState(false);

  const activeTerminal =
    artifactCtx && dock.activeTerminalId
      ? (terminalsById[getTerminalRecordKey(artifactCtx, dock.activeTerminalId)] ?? null)
      : null;

  useEffect(() => {
    if (!artifactCtx) {
      return;
    }

    void activateArtifact(artifactCtx).catch(() => undefined);

    return () => {
      deactivateArtifact(artifactCtx);
    };
  }, [activateArtifact, artifactCtx, deactivateArtifact]);

  useEffect(() => {
    if (!artifactCtx) {
      return;
    }

    const onVisibilityChange = () => {
      setArtifactVisibility(artifactCtx, document.visibilityState === 'visible');
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [artifactCtx, setArtifactVisibility]);

  useEffect(() => {
    if (!artifactCtx) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        !event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        event.code !== 'Backquote'
      ) {
        return;
      }

      event.preventDefault();
      void toggleDock(artifactCtx).catch(() => undefined);
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [artifactCtx, toggleDock]);

  useEffect(() => {
    if (!artifactCtx || !isResizing) {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      const host = hostRef.current;
      const container = host?.parentElement;
      if (!host || !container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const nextHeight = rect.bottom - event.clientY;
      setDockHeight(artifactCtx, nextHeight, rect.height);
    };

    const onMouseUp = () => {
      setIsResizing(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [artifactCtx, isResizing, setDockHeight]);

  if (!artifactCtx || !artifactKey) {
    return null;
  }

  return (
    <div ref={hostRef} className="flex shrink-0 flex-col">
      {dock.open ? (
        <>
          <div
            role="separator"
            aria-label="Resize terminal panel"
            aria-orientation="horizontal"
            onMouseDown={(event) => {
              event.preventDefault();
              setIsResizing(true);
            }}
            className="bg-home-border hover:bg-muted-foreground/40 h-1 cursor-row-resize"
          />
          <section
            className="border-home-border bg-home-panel flex min-h-0 shrink-0 flex-col border-t"
            style={{ height: `${dock.heightPx}px` }}
          >
            <div className="border-home-border flex h-10 min-w-0 shrink-0 items-center border-b">
              <div className="no-scrollbar min-w-0 flex-1 overflow-x-auto">
                {dock.terminalIds.length === 0 ? (
                  <div className="text-muted-foreground flex h-10 items-center px-3 text-xs">
                    No terminals yet
                  </div>
                ) : (
                  <div className="flex min-w-max items-center">
                    {dock.terminalIds.map((terminalId) => {
                      const terminal = terminalsById[getTerminalRecordKey(artifactCtx, terminalId)];
                      if (!terminal) {
                        return null;
                      }

                      const isActive = dock.activeTerminalId === terminalId;
                      const terminalStatus = terminal.status === 'exited' ? 'exited' : 'running';
                      const statusLabel = getConnectionLabel(
                        terminal.connectionState,
                        terminalStatus
                      );

                      return (
                        <div
                          key={terminalId}
                          className={cn(
                            'group border-home-border flex h-10 max-w-[280px] items-center border-r',
                            isActive
                              ? 'bg-home-hover text-foreground'
                              : 'text-muted-foreground hover:bg-home-hover/70'
                          )}
                        >
                          <button
                            type="button"
                            onClick={() => {
                              void selectTerminal(artifactCtx, terminalId).catch(() => undefined);
                            }}
                            className="flex h-full min-w-0 items-center gap-2 px-3 text-left text-xs"
                            title={terminal.title}
                          >
                            <span
                              className={cn(
                                'size-2 shrink-0 rounded-full',
                                terminalStatus === 'running'
                                  ? 'bg-emerald-500'
                                  : 'bg-muted-foreground/70'
                              )}
                            />
                            <span className="truncate">{terminal.title}</span>
                            <span className="text-[10px] text-muted-foreground">{statusLabel}</span>
                            {terminal.isDeleting ? (
                              <Loader2 size={11} className="animate-spin" />
                            ) : null}
                          </button>
                          <button
                            type="button"
                            onClick={(event) => {
                              event.stopPropagation();
                              void deleteTerminal(artifactCtx, terminalId).catch(() => undefined);
                            }}
                            className={cn(
                              'hover:bg-home-border mr-1 rounded p-0.5',
                              isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'
                            )}
                            aria-label={`Kill ${terminal.title}`}
                            title={`Kill ${terminal.title}`}
                          >
                            <X size={12} />
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              <div className="border-home-border flex shrink-0 items-center gap-1 border-l px-2">
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                  title="New terminal"
                  onClick={() => {
                    void createTerminal(artifactCtx).catch(() => undefined);
                  }}
                >
                  <Plus size={14} />
                </Button>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="cursor-pointer text-muted-foreground hover:text-foreground"
                  title="Hide terminal panel"
                  onClick={() => {
                    void toggleDock(artifactCtx).catch(() => undefined);
                  }}
                >
                  <X size={14} />
                </Button>
              </div>
            </div>

            {dock.error ? (
              <div className="border-home-border flex items-center justify-between border-b px-3 py-2 text-xs text-red-500">
                <span>{dock.error}</span>
                <button
                  type="button"
                  onClick={() => clearDockError(artifactCtx)}
                  className="text-muted-foreground hover:text-foreground cursor-pointer"
                >
                  Dismiss
                </button>
              </div>
            ) : null}

            <div className="min-h-0 flex-1 overflow-hidden">
              {activeTerminal ? (
                <TerminalSurface artifactCtx={artifactCtx} terminalId={activeTerminal.id} />
              ) : (
                <div className="flex h-full min-h-0 flex-col items-center justify-center gap-3 p-6 text-center">
                  <div className="bg-home-hover text-muted-foreground flex size-12 items-center justify-center rounded-2xl">
                    <TerminalIcon size={20} />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-medium text-foreground">No active terminal</p>
                    <p className="text-sm text-muted-foreground">
                      Create a terminal to start working in this artifact.
                    </p>
                  </div>
                  <Button
                    variant="secondary"
                    size="sm"
                    className="cursor-pointer"
                    onClick={() => {
                      void createTerminal(artifactCtx).catch(() => undefined);
                    }}
                  >
                    <Plus size={14} />
                    New Terminal
                  </Button>
                </div>
              )}
            </div>
          </section>
        </>
      ) : null}
    </div>
  );
}
