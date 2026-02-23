'use client';

import { ChevronRight, FileText, Folder } from 'lucide-react';
import { useState } from 'react';

import type { MockDiffFile } from '@/lib/mock-diff-data';

type TreeNode = {
  name: string;
  filePath: string | null;
  children: TreeNode[];
  file: MockDiffFile | null;
};

function buildFileTree(files: MockDiffFile[]): TreeNode {
  const root: TreeNode = { name: '', filePath: null, children: [], file: null };

  for (const file of files) {
    const parts = file.filePath.split('/');
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i]!;
      const isFile = i === parts.length - 1;

      let child = current.children.find((c) => c.name === part);
      if (!child) {
        child = {
          name: part,
          filePath: isFile ? file.filePath : null,
          children: [],
          file: isFile ? file : null,
        };
        current.children.push(child);
      }
      current = child;
    }
  }

  return root;
}

function TreeNodeItem({
  node,
  depth,
  selectedFilePath,
  onSelectFile,
}: {
  node: TreeNode;
  depth: number;
  selectedFilePath: string | null;
  onSelectFile: (filePath: string) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(true);
  const isDirectory = node.children.length > 0;
  const isSelected = node.filePath !== null && node.filePath === selectedFilePath;

  if (isDirectory) {
    return (
      <div>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="hover:bg-home-hover flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors"
          style={{ paddingLeft: `${depth * 12 + 8}px` }}
        >
          <ChevronRight
            size={14}
            className={`text-muted-foreground shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
          />
          <Folder size={14} className="text-muted-foreground shrink-0" />
          <span className="text-foreground truncate">{node.name}</span>
        </button>
        {isExpanded && (
          <div>
            {node.children.map((child) => (
              <TreeNodeItem
                key={child.name}
                node={child}
                depth={depth + 1}
                selectedFilePath={selectedFilePath}
                onSelectFile={onSelectFile}
              />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <button
      onClick={() => node.filePath && onSelectFile(node.filePath)}
      className={`flex w-full items-center gap-1.5 rounded px-2 py-1 text-left text-sm transition-colors ${
        isSelected ? 'bg-home-hover' : 'hover:bg-home-hover'
      }`}
      style={{ paddingLeft: `${depth * 12 + 8}px` }}
    >
      <span className="w-[14px] shrink-0" />
      <FileText size={14} className="text-muted-foreground shrink-0" />
      <span
        className={`truncate ${isSelected ? 'text-foreground font-medium' : 'text-foreground'}`}
      >
        {node.name}
      </span>
      {node.file && (
        <span className="ml-auto flex shrink-0 items-center gap-1 text-xs">
          {node.file.additions > 0 && (
            <span className="text-diff-added-fg">+{node.file.additions}</span>
          )}
          {node.file.deletions > 0 && (
            <span className="text-diff-removed-fg">-{node.file.deletions}</span>
          )}
        </span>
      )}
    </button>
  );
}

export function DiffFileTree({
  files,
  selectedFilePath,
  onSelectFile,
}: {
  files: MockDiffFile[];
  selectedFilePath: string | null;
  onSelectFile: (filePath: string) => void;
}) {
  const tree = buildFileTree(files);

  return (
    <div className="border-home-border flex h-full w-[20%] min-w-[200px] flex-col border-r">
      <div className="border-home-border flex items-center justify-between border-b px-3 py-2">
        <span className="text-sm font-medium">Files</span>
        <span className="text-muted-foreground text-xs">{files.length} changed</span>
      </div>
      <div className="flex-1 overflow-y-auto p-1">
        {tree.children.map((child) => (
          <TreeNodeItem
            key={child.name}
            node={child}
            depth={0}
            selectedFilePath={selectedFilePath}
            onSelectFile={onSelectFile}
          />
        ))}
      </div>
    </div>
  );
}
