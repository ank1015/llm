'use client';

import { FitAddon } from '@xterm/addon-fit';
import { Terminal as XTerm } from '@xterm/xterm';
import { useEffect, useRef } from 'react';

import type { ArtifactContext } from '@/lib/client-api';

import {
  getTerminalReplayFrames,
  getTerminalRecordKey,
  useTerminalStore,
} from '@/stores/terminals-store';
import { useUiStore } from '@/stores/ui-store';

type TerminalSurfaceProps = {
  artifactCtx: ArtifactContext;
  terminalId: string;
};

function applyTerminalTheme(terminal: XTerm): void {
  const styles = getComputedStyle(document.documentElement);

  terminal.options.theme = {
    background: styles.getPropertyValue('--home-panel').trim() || undefined,
    foreground: styles.getPropertyValue('--foreground').trim() || undefined,
    cursor: styles.getPropertyValue('--foreground').trim() || undefined,
    selectionBackground: styles.getPropertyValue('--home-hover').trim() || undefined,
  };
}

export function TerminalSurface({ artifactCtx, terminalId }: TerminalSurfaceProps) {
  const terminalRecordKey = getTerminalRecordKey(artifactCtx, terminalId);
  const terminalRecord = useTerminalStore(
    (state) => state.terminalsById[terminalRecordKey] ?? null
  );
  const sendInput = useTerminalStore((state) => state.sendInput);
  const resizeTerminal = useTerminalStore((state) => state.resizeTerminal);
  const theme = useUiStore((state) => state.theme);

  const containerRef = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<XTerm | null>(null);
  const fitAddonRef = useRef<FitAddon | null>(null);
  const lastRenderedSeqRef = useRef(0);
  const lastSentSizeRef = useRef<{ cols: number; rows: number } | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const xterm = new XTerm({
      allowTransparency: false,
      convertEol: false,
      cursorBlink: true,
      fontFamily: 'var(--font-geist-mono), monospace',
      fontSize: 13,
      lineHeight: 1.2,
      scrollback: 5_000,
    });
    const fitAddon = new FitAddon();

    xterm.loadAddon(fitAddon);
    xterm.open(container);
    applyTerminalTheme(xterm);

    terminalRef.current = xterm;
    fitAddonRef.current = fitAddon;
    lastRenderedSeqRef.current = 0;
    lastSentSizeRef.current = null;

    const syncSize = () => {
      if (!terminalRef.current || !fitAddonRef.current) {
        return;
      }

      fitAddonRef.current.fit();
      const cols = terminalRef.current.cols;
      const rows = terminalRef.current.rows;
      if (cols <= 0 || rows <= 0) {
        return;
      }

      const previous = lastSentSizeRef.current;
      if (previous?.cols === cols && previous.rows === rows) {
        return;
      }

      lastSentSizeRef.current = { cols, rows };
      resizeTerminal(artifactCtx, terminalId, cols, rows);
    };

    const dataDisposable = xterm.onData((data) => {
      sendInput(artifactCtx, terminalId, data);
    });

    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(syncSize);
    });
    resizeObserver.observe(container);

    requestAnimationFrame(() => {
      syncSize();
      xterm.focus();
    });

    return () => {
      resizeObserver.disconnect();
      dataDisposable.dispose();
      xterm.dispose();
      terminalRef.current = null;
      fitAddonRef.current = null;
    };
  }, [artifactCtx, resizeTerminal, sendInput, terminalId]);

  useEffect(() => {
    const xterm = terminalRef.current;
    if (!xterm || !terminalRecord) {
      return;
    }

    const frames = getTerminalReplayFrames(artifactCtx, terminalId);
    for (const frame of frames) {
      if (frame.seq <= lastRenderedSeqRef.current) {
        continue;
      }

      lastRenderedSeqRef.current = frame.seq;
      if (frame.type === 'output') {
        xterm.write(frame.data);
      }
    }
  }, [artifactCtx, terminalId, terminalRecord?.bufferVersion, terminalRecord]);

  useEffect(() => {
    const xterm = terminalRef.current;
    if (!xterm) {
      return;
    }

    applyTerminalTheme(xterm);
    fitAddonRef.current?.fit();
  }, [theme]);

  useEffect(() => {
    if (terminalRecord?.connectionState === 'connected') {
      terminalRef.current?.focus();
    }
  }, [terminalRecord?.connectionState]);

  if (!terminalRecord) {
    return null;
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div ref={containerRef} className="min-h-0 flex-1 overflow-hidden px-2 py-2" />
      {terminalRecord.socketError ? (
        <div className="border-home-border border-t px-3 py-1.5 text-xs text-red-500">
          {terminalRecord.socketError}
        </div>
      ) : null}
      {terminalRecord.status === 'exited' ? (
        <div className="border-home-border border-t px-3 py-1.5 text-xs text-muted-foreground">
          Process exited
          {terminalRecord.exitCode !== null ? ` with code ${terminalRecord.exitCode}` : ''}.
        </div>
      ) : null}
    </div>
  );
}
