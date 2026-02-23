'use client';

import { ChevronDown, ChevronUp } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';

import type { MockDiffFile, MockDiffLine } from '@/lib/mock-diff-data';

import { Button } from '@/components/ui/button';
import { buildFullFileView } from '@/lib/mock-diff-data';

function StatusBadge({ status }: { status: MockDiffFile['status'] }) {
  const config = {
    added: { label: 'Added', className: 'bg-diff-added-bg text-diff-added-fg' },
    modified: { label: 'Modified', className: 'bg-diff-hunk-bg text-diff-hunk-fg' },
    deleted: { label: 'Deleted', className: 'bg-diff-removed-bg text-diff-removed-fg' },
  }[status];

  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
      {config.label}
    </span>
  );
}

function DiffLine({
  line,
  hunkRef,
}: {
  line: MockDiffLine;
  hunkRef?: (el: HTMLTableRowElement | null) => void;
}) {
  const bgClass =
    line.type === 'added'
      ? 'bg-diff-added-bg'
      : line.type === 'removed'
        ? 'bg-diff-removed-bg'
        : '';

  const fgClass =
    line.type === 'added'
      ? 'text-diff-added-fg'
      : line.type === 'removed'
        ? 'text-diff-removed-fg'
        : '';

  const prefix = line.type === 'added' ? '+' : line.type === 'removed' ? '-' : ' ';

  const lineNumber = line.newLineNumber ?? line.oldLineNumber ?? '';

  return (
    <tr ref={hunkRef} className={bgClass}>
      <td className="text-muted-foreground w-[1px] select-none whitespace-nowrap px-2 text-right align-top font-mono text-xs leading-6">
        {lineNumber}
      </td>
      <td
        className={`w-[1px] select-none whitespace-nowrap pl-2 pr-1 text-center align-top font-mono text-[13px] leading-6 ${fgClass}`}
      >
        {prefix}
      </td>
      <td className="whitespace-pre pr-4 font-mono text-[13px] leading-6">{line.content}</td>
    </tr>
  );
}

export function DiffViewer({ file }: { file: MockDiffFile | null }) {
  const [currentHunkIndex, setCurrentHunkIndex] = useState(0);
  const hunkElements = useRef<Map<number, HTMLTableRowElement>>(new Map());
  const prevFilePathRef = useRef<string | null>(null);

  const fullView = useMemo(() => (file ? buildFullFileView(file) : null), [file]);

  // Reset hunk index when file changes
  if (file?.filePath !== prevFilePathRef.current) {
    prevFilePathRef.current = file?.filePath ?? null;
    if (currentHunkIndex !== 0) setCurrentHunkIndex(0);
  }

  const scrollToHunk = useCallback((index: number) => {
    const row = hunkElements.current.get(index);
    if (row) {
      row.scrollIntoView({ behavior: 'smooth', block: 'center' });
      setCurrentHunkIndex(index);
    }
  }, []);

  const goToPrevHunk = useCallback(() => {
    if (currentHunkIndex > 0) {
      scrollToHunk(currentHunkIndex - 1);
    }
  }, [currentHunkIndex, scrollToHunk]);

  const goToNextHunk = useCallback(() => {
    if (fullView && currentHunkIndex < fullView.hunkStartIndices.length - 1) {
      scrollToHunk(currentHunkIndex + 1);
    }
  }, [currentHunkIndex, fullView, scrollToHunk]);

  if (!file || !fullView) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Select a file to view changes</p>
      </div>
    );
  }

  const lineToHunkIndex = new Map<number, number>();
  fullView.hunkStartIndices.forEach((lineIdx, hunkIdx) => {
    lineToHunkIndex.set(lineIdx, hunkIdx);
  });

  const totalHunks = fullView.hunkStartIndices.length;

  return (
    <div className="relative flex h-full flex-col overflow-hidden">
      <div className="border-home-border bg-home-panel sticky top-0 z-10 flex items-center gap-3 border-b px-4 py-2">
        <span className="font-mono text-sm">{file.filePath}</span>
        <StatusBadge status={file.status} />
        <div className="flex-1" />
        <span className="text-diff-added-fg text-xs font-medium">+{file.additions}</span>
        <span className="text-diff-removed-fg text-xs font-medium">-{file.deletions}</span>
      </div>
      <div className="flex-1 overflow-auto">
        <table className="w-full border-collapse">
          <tbody>
            {fullView.lines.map((line, i) => {
              const hunkIdx = lineToHunkIndex.get(i);
              return (
                <DiffLine
                  key={i}
                  line={line}
                  hunkRef={
                    hunkIdx !== undefined
                      ? (el) => {
                          if (el) hunkElements.current.set(hunkIdx, el);
                        }
                      : undefined
                  }
                />
              );
            })}
          </tbody>
        </table>
      </div>

      {totalHunks > 0 && (
        <div className="bg-home-panel border-home-border absolute bottom-4 right-4 flex items-center gap-1 rounded-lg border px-1 py-1 shadow-md">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goToPrevHunk}
            disabled={currentHunkIndex === 0}
          >
            <ChevronUp size={16} />
          </Button>
          <span className="text-muted-foreground min-w-[3ch] text-center text-xs">
            {currentHunkIndex + 1}/{totalHunks}
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={goToNextHunk}
            disabled={currentHunkIndex === totalHunks - 1}
          >
            <ChevronDown size={16} />
          </Button>
        </div>
      )}
    </div>
  );
}
