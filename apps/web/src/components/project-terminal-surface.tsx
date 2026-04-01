"use client";

import {
  Add01Icon,
  ComputerTerminal01Icon,
  Delete03Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { FitAddon } from "@xterm/addon-fit";
import { Terminal as XTerm } from "@xterm/xterm";
import { useEffect, useRef } from "react";

import { cn } from "@/lib/utils";
import {
  getTerminalArtifactKey,
  getTerminalRecordKey,
  getTerminalReplayFrames,
  useTerminalStore,
} from "@/stores/terminals-store";
import { useUiStore } from "@/stores/ui-store";

import type { ArtifactContext } from "@/lib/client-api";
import type { TerminalDockState } from "@/stores/terminals-store";

const MIN_TERMINAL_FIT_WIDTH_PX = 120;
const MIN_TERMINAL_FIT_HEIGHT_PX = 80;

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

function applyTerminalTheme(terminal: XTerm): void {
  const styles = getComputedStyle(document.documentElement);
  const foreground =
    styles.getPropertyValue("--foreground").trim() ||
    (document.documentElement.classList.contains("dark") ? "#F3F4F6" : "#111111");
  const background = styles.getPropertyValue("--terminal-surface-bg").trim() || undefined;
  const isDark = document.documentElement.classList.contains("dark");
  const palette = isDark
    ? {
        black: "#14161B",
        red: "#FF7A6B",
        green: "#8FE067",
        yellow: "#E9C46A",
        blue: "#7AB7FF",
        magenta: "#C894FF",
        cyan: "#5EDBFF",
        white: "#F3F4F6",
        brightBlack: "#6C7280",
        brightRed: "#FF9387",
        brightGreen: "#A5EE84",
        brightYellow: "#F2D487",
        brightBlue: "#98CAFF",
        brightMagenta: "#D8AEFF",
        brightCyan: "#84E7FF",
        brightWhite: "#FFFFFF",
      }
    : {
        black: "#111111",
        red: "#C85A52",
        green: "#5F9D46",
        yellow: "#A67C2D",
        blue: "#4B7CC5",
        magenta: "#9360C9",
        cyan: "#2A92B0",
        white: "#D5D8DE",
        brightBlack: "#666C75",
        brightRed: "#DD6B61",
        brightGreen: "#71AF55",
        brightYellow: "#B98D3E",
        brightBlue: "#5C90DB",
        brightMagenta: "#A674DB",
        brightCyan: "#35A7C6",
        brightWhite: "#F4F5F7",
      };

  terminal.options.theme = {
    background,
    foreground,
    cursor: foreground,
    cursorAccent: background,
    selectionBackground: styles.getPropertyValue("--home-hover").trim() || undefined,
    black: palette.black,
    red: palette.red,
    green: palette.green,
    yellow: palette.yellow,
    blue: palette.blue,
    magenta: palette.magenta,
    cyan: palette.cyan,
    white: palette.white,
    brightBlack: palette.brightBlack,
    brightRed: palette.brightRed,
    brightGreen: palette.brightGreen,
    brightYellow: palette.brightYellow,
    brightBlue: palette.brightBlue,
    brightMagenta: palette.brightMagenta,
    brightCyan: palette.brightCyan,
    brightWhite: palette.brightWhite,
    scrollbarSliderBackground: isDark ? "rgba(245, 245, 245, 0.18)" : "rgba(17, 17, 17, 0.18)",
    scrollbarSliderHoverBackground: isDark
      ? "rgba(245, 245, 245, 0.3)"
      : "rgba(17, 17, 17, 0.28)",
    scrollbarSliderActiveBackground: isDark
      ? "rgba(245, 245, 245, 0.4)"
      : "rgba(17, 17, 17, 0.36)",
  };
}

function getTerminalFontFamily(): string {
  const styles = getComputedStyle(document.documentElement);
  const mono = styles.getPropertyValue("--font-geist-mono").trim();

  return [
    '"SFMono-Regular"',
    "ui-monospace",
    "Menlo",
    "Monaco",
    "Consolas",
    mono,
    '"Liberation Mono"',
    "monospace",
  ]
    .filter(Boolean)
    .join(", ");
}

function applyTerminalTypography(terminal: XTerm): void {
  terminal.options.fontFamily = getTerminalFontFamily();
  terminal.options.fontSize = 12;
  terminal.options.fontWeight = 450;
  terminal.options.fontWeightBold = 620;
  terminal.options.letterSpacing = 0;
  terminal.options.lineHeight = 1.2;
}

export function ProjectTerminalSurface({
  artifactContext,
  terminalId,
}: {
  artifactContext: ArtifactContext;
  terminalId: string;
}) {
  const artifactKey = getTerminalArtifactKey(
    artifactContext.projectId,
    artifactContext.artifactId,
  );
  const dock = useTerminalStore((state) =>
    state.dockByArtifact[artifactKey] ?? EMPTY_DOCK_STATE,
  );
  const terminalsById = useTerminalStore((state) => state.terminalsById);
  const terminalRecordKey = getTerminalRecordKey(artifactContext, terminalId);
  const terminalRecord = useTerminalStore(
    (state) => state.terminalsById[terminalRecordKey] ?? null,
  );
  const createTerminal = useTerminalStore((state) => state.createTerminal);
  const deleteTerminal = useTerminalStore((state) => state.deleteTerminal);
  const selectTerminal = useTerminalStore((state) => state.selectTerminal);
  const sendInput = useTerminalStore((state) => state.sendInput);
  const resizeTerminal = useTerminalStore((state) => state.resizeTerminal);
  const theme = useUiStore((state) => state.theme);

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastRenderedSeqRef = useRef(0);
  const lastSentSizeRef = useRef<{ cols: number; rows: number } | null>(null);
  const fitFrameRef = useRef<number | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const xterm = new XTerm({
      allowTransparency: false,
      convertEol: false,
      cursorBlink: true,
      scrollback: 10_000,
      smoothScrollDuration: 80,
    });
    const fitAddon = new FitAddon();

    xterm.loadAddon(fitAddon);
    xterm.open(container);
    applyTerminalTypography(xterm);
    applyTerminalTheme(xterm);

    terminalRef.current = xterm;
    fitAddonRef.current = fitAddon;
    lastRenderedSeqRef.current = 0;
    lastSentSizeRef.current = null;

    const syncSize = () => {
      if (!terminalRef.current || !fitAddonRef.current) {
        return;
      }

      const rect = container.getBoundingClientRect();
      if (
        rect.width < MIN_TERMINAL_FIT_WIDTH_PX ||
        rect.height < MIN_TERMINAL_FIT_HEIGHT_PX
      ) {
        return;
      }

      fitAddonRef.current.fit();
      const cols = terminalRef.current.cols;
      const rows = terminalRef.current.rows;
      if (cols <= 0 || rows <= 0) {
        return;
      }

      const previous = lastSentSizeRef.current;
      if (previous?.cols === cols && previous?.rows === rows) {
        return;
      }

      lastSentSizeRef.current = { cols, rows };
      resizeTerminal(artifactContext, terminalId, cols, rows);
    };

    const scheduleSyncSize = () => {
      if (fitFrameRef.current !== null) {
        cancelAnimationFrame(fitFrameRef.current);
      }

      fitFrameRef.current = requestAnimationFrame(() => {
        fitFrameRef.current = requestAnimationFrame(() => {
          fitFrameRef.current = null;
          syncSize();
        });
      });
    };

    const dataDisposable = xterm.onData((data: string) => {
      sendInput(artifactContext, terminalId, data);
    });

    const resizeObserver = new ResizeObserver(() => {
      scheduleSyncSize();
    });
    resizeObserver.observe(container);

    void document.fonts?.ready.then(() => {
      if (!terminalRef.current) {
        return;
      }

      applyTerminalTypography(terminalRef.current);
      scheduleSyncSize();
    });

    scheduleSyncSize();
    requestAnimationFrame(() => {
      xterm.focus();
    });

    return () => {
      if (fitFrameRef.current !== null) {
        cancelAnimationFrame(fitFrameRef.current);
        fitFrameRef.current = null;
      }
      resizeObserver.disconnect();
      dataDisposable.dispose();
      xterm.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [artifactContext, resizeTerminal, sendInput, terminalId]);

  useEffect(() => {
    const xterm = terminalRef.current;
    if (!xterm || !terminalRecord) {
      return;
    }

    const frames = getTerminalReplayFrames(artifactContext, terminalId);
    for (const frame of frames) {
      if (frame.seq <= lastRenderedSeqRef.current) {
        continue;
      }

      lastRenderedSeqRef.current = frame.seq;
      if (frame.type === "output") {
        xterm.write(frame.data);
      }
    }
  }, [artifactContext, terminalId, terminalRecord, terminalRecord?.bufferVersion]);

  useEffect(() => {
    const xterm = terminalRef.current;
    if (!xterm) {
      return;
    }

    applyTerminalTypography(xterm);
    applyTerminalTheme(xterm);
    fitAddonRef.current?.fit();
  }, [theme]);

  useEffect(() => {
    if (terminalRecord?.connectionState === "connected") {
      terminalRef.current?.focus();
    }
  }, [terminalRecord?.connectionState]);

  if (!terminalRecord) {
    return null;
  }

  const terminals = dock.terminalIds
    .map((id) => terminalsById[getTerminalRecordKey(artifactContext, id)] ?? null)
    .filter((terminal): terminal is NonNullable<typeof terminal> => terminal !== null);
  const showSessionsRail = terminals.length > 1;

  return (
    <div className="relative flex h-full min-h-0 flex-1 overflow-hidden">
      <div className="absolute right-1 top-1 z-20 flex items-center gap-0.5">
        <button
          type="button"
          onClick={() => {
            void createTerminal(artifactContext).catch(() => undefined);
          }}
          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-black/42 transition-colors hover:bg-black/[0.04] hover:text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/44 dark:hover:bg-white/[0.05] dark:hover:text-white dark:focus-visible:ring-white/12"
          aria-label="New terminal"
          title="New terminal"
        >
          <HugeiconsIcon
            icon={Add01Icon}
            size={15}
            color="currentColor"
            strokeWidth={1.8}
          />
        </button>

        <button
          type="button"
          onClick={() => {
            void deleteTerminal(artifactContext, terminalId).catch(() => undefined);
          }}
          disabled={terminalRecord.isDeleting}
          className="inline-flex size-6 cursor-pointer items-center justify-center rounded-md text-black/42 transition-colors hover:bg-black/[0.04] hover:text-black disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/44 dark:hover:bg-white/[0.05] dark:hover:text-white dark:focus-visible:ring-white/12"
          aria-label="Kill current terminal"
          title="Kill current terminal"
        >
          <HugeiconsIcon
            icon={Delete03Icon}
            size={15}
            color="currentColor"
            strokeWidth={1.8}
          />
        </button>
      </div>

      <div className="flex h-full min-h-0 min-w-0 flex-1">
        <div
          ref={containerRef}
          className="artifact-terminal-surface h-full min-h-0 min-w-0 flex-1 overflow-hidden"
          style={{ paddingRight: showSessionsRail ? "2.25rem" : undefined }}
        />
      </div>

      {showSessionsRail ? (
        <aside
          aria-label="Terminal sessions"
          className="no-scrollbar absolute bottom-0 right-0 top-0 flex w-9 flex-col overflow-hidden border-l border-black/5 dark:border-white/8"
        >
          <div className="min-h-0 flex-1 overflow-y-auto pb-1 pt-8">
            <div className="flex flex-col items-center gap-1 px-1">
              {terminals.map((terminal, index) => {
                const isActive = terminal.id === terminalId;

                return (
                  <button
                    key={terminal.id}
                    type="button"
                    title={terminal.title}
                    aria-label={`Switch to Terminal ${index + 1}`}
                    aria-current={isActive ? "page" : undefined}
                    onClick={() => {
                      void selectTerminal(artifactContext, terminal.id).catch(
                        () => undefined,
                      );
                    }}
                    className={cn(
                      "relative inline-flex size-7 items-center justify-center rounded-md transition-colors",
                      isActive
                        ? "bg-black/[0.05] text-black dark:bg-white/[0.06] dark:text-white"
                        : "text-black/42 hover:bg-black/[0.03] hover:text-black dark:text-white/42 dark:hover:bg-white/[0.04] dark:hover:text-white",
                    )}
                  >
                    <HugeiconsIcon
                      icon={ComputerTerminal01Icon}
                      size={15}
                      color="currentColor"
                      strokeWidth={1.8}
                    />
                    <span
                      className={cn(
                        "absolute bottom-1 right-1 size-1 rounded-full",
                        isActive
                          ? "bg-black/66 dark:bg-white/70"
                          : "bg-black/16 dark:bg-white/18",
                      )}
                    />
                  </button>
                );
              })}
            </div>
          </div>
        </aside>
      ) : null}

      {terminalRecord.socketError ? (
        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-[#E7C6C6] bg-[#FDEBEC] px-3 py-1.5 text-xs text-[#9F2F2D] dark:border-[#4A2525] dark:bg-[#201312] dark:text-[#F2B5B3]">
          {terminalRecord.socketError}
        </div>
      ) : null}

      {terminalRecord.status === "exited" ? (
        <div className="absolute inset-x-0 bottom-0 z-20 border-t border-black/6 bg-[var(--terminal-surface-bg)] px-3 py-1.5 text-xs text-black/48 dark:border-white/8 dark:text-white/50">
          Process exited
          {terminalRecord.exitCode !== null ? ` with code ${terminalRecord.exitCode}` : ""}.
        </div>
      ) : null}
    </div>
  );
}
