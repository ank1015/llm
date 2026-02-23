import type { MockDiffFile, MockDiffHunk, MockDiffLine } from '@/lib/mock-diff-data';

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

function DiffLine({ line }: { line: MockDiffLine }) {
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

  return (
    <tr className={bgClass}>
      <td className="text-muted-foreground w-[1px] select-none whitespace-nowrap px-2 text-right align-top font-mono text-xs leading-6">
        {line.oldLineNumber ?? ''}
      </td>
      <td className="text-muted-foreground w-[1px] select-none whitespace-nowrap px-2 text-right align-top font-mono text-xs leading-6">
        {line.newLineNumber ?? ''}
      </td>
      <td
        className={`w-[1px] select-none whitespace-nowrap pl-2 pr-1 text-center align-top font-mono text-[13px] leading-6 ${fgClass}`}
      >
        {prefix}
      </td>
      <td className="whitespace-pre font-mono text-[13px] leading-6 pr-4">{line.content}</td>
    </tr>
  );
}

function HunkHeader({ header }: { header: string }) {
  return (
    <tr className="bg-diff-hunk-bg">
      <td colSpan={4} className="text-diff-hunk-fg px-3 py-1 font-mono text-xs leading-6">
        {header}
      </td>
    </tr>
  );
}

function DiffHunk({ hunk }: { hunk: MockDiffHunk }) {
  return (
    <>
      <HunkHeader header={hunk.header} />
      {hunk.lines.map((line, i) => (
        <DiffLine key={i} line={line} />
      ))}
    </>
  );
}

export function DiffViewer({ file }: { file: MockDiffFile | null }) {
  if (!file) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">Select a file to view changes</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
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
            {file.hunks.map((hunk, i) => (
              <DiffHunk key={i} hunk={hunk} />
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
