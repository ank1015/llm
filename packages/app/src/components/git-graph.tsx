'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';

import type { MockBranch, MockProject, MockThread } from '@/lib/mock-data';
import type { FC } from 'react';

import { branchToSlug } from '@/lib/mock-data';

// ---------------------------------------------------------------------------
// Layout constants
// ---------------------------------------------------------------------------

const MAIN_X = 200;
const BRANCH_X = 320;
const ROW_HEIGHT = 100;
const COMMIT_RADIUS = 7;
const BRANCH_DOT_RADIUS = 6;
const TOP_PADDING = 70;
const CURVE_OFFSET = 28;
const COMMIT_SPACING = 50;
const HIT_AREA_RADIUS = 14;
const SVG_WIDTH = 520;

// Colors (CSS variable references for theme support)
const MAIN_COLOR = 'var(--foreground)';
const ACTIVE_COLOR = '#98CEFF';
const MERGED_COLOR = 'var(--muted-foreground)';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BranchLayout = {
  branch: MockBranch;
  /** Fork point on main line (lower on screen = larger Y) */
  forkY: number;
  /** Where branch lane starts after the fork curve */
  branchStartY: number;
  /** End of branch content (higher on screen = smaller Y) */
  endY: number;
  /** Merge-back point on main (smaller Y than endY), null for active */
  mergeY: number | null;
  color: string;
};

type HoveredCommit = {
  thread: MockThread;
  branchName: string;
  svgX: number;
  svgY: number;
};

// ---------------------------------------------------------------------------
// Layout computation — inverted: initial commit at bottom, HEAD at top
// ---------------------------------------------------------------------------

function computeLayout(project: MockProject) {
  // Compute in natural order (top-to-bottom), then flip Y
  const mergedBranches = project.branches.filter((b) => b.status === 'merged');
  const activeBranches = project.branches.filter((b) => b.status === 'active');
  const allBranches = [...mergedBranches, ...activeBranches];

  const rawLayouts: Array<{
    branch: MockBranch;
    forkY: number;
    endY: number;
    mergeY: number | null;
    color: string;
  }> = [];

  let currentY = TOP_PADDING;
  const mainStartY = currentY;

  for (const branch of allBranches) {
    currentY += ROW_HEIGHT;
    const forkY = currentY;
    const branchLength = Math.max(branch.threads.length, 1);
    const endY = forkY + CURVE_OFFSET + branchLength * COMMIT_SPACING;
    const isMerged = branch.status === 'merged';
    const mergeY = isMerged ? endY + 40 : null;

    rawLayouts.push({
      branch,
      forkY,
      endY,
      mergeY,
      color: isMerged ? MERGED_COLOR : ACTIVE_COLOR,
    });

    currentY = mergeY ?? endY;
  }

  const mainEndY = currentY + ROW_HEIGHT;
  const totalHeight = mainEndY + TOP_PADDING;

  // Flip Y so initial commit is at the bottom and HEAD is at the top
  const flip = (y: number) => totalHeight - y;

  const layouts: BranchLayout[] = rawLayouts.map((l) => {
    const flippedFork = flip(l.forkY);
    return {
      branch: l.branch,
      forkY: flippedFork,
      branchStartY: flippedFork - CURVE_OFFSET,
      endY: flip(l.endY),
      mergeY: l.mergeY !== null ? flip(l.mergeY) : null,
      color: l.color,
    };
  });

  return {
    layouts,
    headY: flip(mainEndY),
    initialCommitY: flip(mainStartY),
    totalHeight,
  };
}

// ---------------------------------------------------------------------------
// BranchPath — draws a single branch (inverted: branches extend upward)
// ---------------------------------------------------------------------------

const BranchPath: FC<{
  layout: BranchLayout;
  onCommitHover: (commit: HoveredCommit | null) => void;
  onCommitClick: (thread: MockThread, branchName: string) => void;
}> = ({ layout, onCommitHover, onCommitClick }) => {
  const { branch, forkY, branchStartY, endY, mergeY, color } = layout;
  const isMerged = branch.status === 'merged';

  // Fork curve: from main upward-right to branch lane
  const forkPath = [
    `M ${MAIN_X} ${forkY}`,
    `C ${MAIN_X + 50} ${forkY}, ${BRANCH_X - 50} ${branchStartY}, ${BRANCH_X} ${branchStartY}`,
  ].join(' ');

  // Branch vertical segment (goes upward from branchStartY to endY)
  const branchLine = `M ${BRANCH_X} ${branchStartY} L ${BRANCH_X} ${endY}`;

  // Merge curve: from branch end upward-left back to main
  const mergePath =
    mergeY !== null
      ? [
          `M ${BRANCH_X} ${endY}`,
          `C ${BRANCH_X - 50} ${mergeY}, ${MAIN_X + 50} ${mergeY}, ${MAIN_X} ${mergeY}`,
        ].join(' ')
      : '';

  // Commit dots evenly spaced between branchStartY and endY (going upward)
  const span = branchStartY - endY;
  const commitDots = branch.threads.map((_, i) => {
    return branchStartY - (i + 1) * (span / (branch.threads.length + 1));
  });

  return (
    <g>
      {/* Fork curve */}
      <path d={forkPath} fill="none" stroke={color} strokeWidth={2.5} />

      {/* Branch vertical line */}
      <path d={branchLine} fill="none" stroke={color} strokeWidth={2.5} />

      {/* Merge curve back to main */}
      {isMerged && mergeY !== null && (
        <>
          <path d={mergePath} fill="none" stroke={color} strokeWidth={2.5} />
          <circle cx={MAIN_X} cy={mergeY} r={COMMIT_RADIUS} fill={color} />
        </>
      )}

      {/* Active branch: open-ended tip pointing upward */}
      {!isMerged && (
        <>
          <circle cx={BRANCH_X} cy={endY} r={5} fill="none" stroke={color} strokeWidth={2.5} />
          <line
            x1={BRANCH_X}
            y1={endY - 8}
            x2={BRANCH_X}
            y2={endY - 18}
            stroke={color}
            strokeWidth={2}
            strokeDasharray="3 4"
          />
        </>
      )}

      {/* Fork dot on main */}
      <circle cx={MAIN_X} cy={forkY} r={COMMIT_RADIUS} fill={MAIN_COLOR} />

      {/* Commit dots on branch — visible dots + invisible hit areas */}
      {commitDots.map((cy, i) => {
        const thread = branch.threads[i];
        if (!thread) return null;
        return (
          <g key={thread.threadId}>
            <circle cx={BRANCH_X} cy={cy} r={BRANCH_DOT_RADIUS} fill={color} />
            <circle
              cx={BRANCH_X}
              cy={cy}
              r={HIT_AREA_RADIUS}
              fill="transparent"
              style={{ cursor: 'pointer' }}
              onMouseEnter={() =>
                onCommitHover({
                  thread,
                  branchName: branch.branchName,
                  svgX: BRANCH_X,
                  svgY: cy,
                })
              }
              onMouseLeave={() => onCommitHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onCommitClick(thread, branch.branchName);
              }}
            />
          </g>
        );
      })}

      {/* Branch name label (next to fork curve endpoint) */}
      <text
        x={BRANCH_X + 18}
        y={branchStartY + 6}
        fill={color}
        fontSize={14}
        fontFamily="var(--font-geist-sans), sans-serif"
        fontWeight={500}
      >
        {branch.branchName}
      </text>

      {/* Thread count */}
      {branch.threads.length > 0 && (
        <text
          x={BRANCH_X + 18}
          y={branchStartY + 24}
          fill="var(--muted-foreground)"
          fontSize={12}
          fontFamily="var(--font-geist-sans), sans-serif"
        >
          {branch.threads.length} {branch.threads.length === 1 ? 'thread' : 'threads'}
        </text>
      )}
    </g>
  );
};

// ---------------------------------------------------------------------------
// GitGraph — scrollable, no zoom/pan canvas
// ---------------------------------------------------------------------------

export const GitGraph: FC<{ project: MockProject }> = ({ project }) => {
  const router = useRouter();
  const [hoveredCommit, setHoveredCommit] = useState<HoveredCommit | null>(null);

  if (project.branches.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">No branches yet</p>
      </div>
    );
  }

  const { layouts, headY, initialCommitY, totalHeight } = computeLayout(project);

  const handleCommitClick = (thread: MockThread, branchName: string) => {
    router.push(`/${project.projectName}/${branchToSlug(branchName)}/${thread.threadId}`);
  };

  return (
    <div className="relative inline-block py-8">
      <svg width={SVG_WIDTH} height={totalHeight} viewBox={`0 0 ${SVG_WIDTH} ${totalHeight}`}>
        {/* Main vertical line */}
        <line
          x1={MAIN_X}
          y1={headY}
          x2={MAIN_X}
          y2={initialCommitY}
          stroke={MAIN_COLOR}
          strokeWidth={2.5}
        />

        {/* HEAD dot (top) */}
        <circle cx={MAIN_X} cy={headY} r={COMMIT_RADIUS + 1} fill={MAIN_COLOR} />

        {/* "main" label at top */}
        <text
          x={MAIN_X}
          y={headY - 18}
          fill="var(--muted-foreground)"
          fontSize={13}
          fontFamily="var(--font-geist-sans), sans-serif"
          textAnchor="middle"
          fontWeight={500}
        >
          main
        </text>

        {/* Initial commit dot (bottom) */}
        <circle cx={MAIN_X} cy={initialCommitY} r={COMMIT_RADIUS + 1} fill={MAIN_COLOR} />

        {/* Branch paths */}
        {layouts.map((layout) => (
          <BranchPath
            key={layout.branch.branchId}
            layout={layout}
            onCommitHover={setHoveredCommit}
            onCommitClick={handleCommitClick}
          />
        ))}
      </svg>

      {/* Hover tooltip */}
      {hoveredCommit && (
        <div
          className="bg-popover text-popover-foreground border-border pointer-events-none absolute z-10 rounded-lg border px-3 py-2 shadow-md"
          style={{
            left: hoveredCommit.svgX,
            top: hoveredCommit.svgY - 12,
            transform: 'translate(-50%, -100%)',
          }}
        >
          <p className="text-sm font-medium whitespace-nowrap">{hoveredCommit.thread.threadName}</p>
          <p className="text-muted-foreground mt-0.5 text-xs">
            {hoveredCommit.branchName} &middot; {hoveredCommit.thread.age}
          </p>
        </div>
      )}
    </div>
  );
};
