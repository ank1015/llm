'use client';

import type { MockBranch, MockProject } from '@/lib/mock-data';
import type { FC } from 'react';


// Layout constants
const MAIN_X = 80;
const BRANCH_X = 220;
const ROW_HEIGHT = 100;
const COMMIT_RADIUS = 7;
const BRANCH_DOT_RADIUS = 6;
const TOP_PADDING = 70;
const CURVE_OFFSET = 28;
const COMMIT_SPACING = 50;

// Colors (CSS variable references for theme support)
const MAIN_COLOR = 'var(--foreground)';
const ACTIVE_COLOR = '#3b82f6';
const MERGED_COLOR = 'var(--muted-foreground)';

type BranchLayout = {
  branch: MockBranch;
  forkY: number;
  endY: number;
  mergeY: number | null;
  color: string;
};

function computeLayout(project: MockProject) {
  // Merged branches first (older), then active (current) — time flows top-to-bottom
  const mergedBranches = project.branches.filter((b) => b.status === 'merged');
  const activeBranches = project.branches.filter((b) => b.status === 'active');
  const allBranches = [...mergedBranches, ...activeBranches];

  const layouts: BranchLayout[] = [];
  let currentY = TOP_PADDING;

  const mainStartY = currentY;

  for (const branch of allBranches) {
    currentY += ROW_HEIGHT;
    const forkY = currentY;

    const branchLength = Math.max(branch.threads.length, 1);
    const endY = forkY + CURVE_OFFSET + branchLength * COMMIT_SPACING;

    const isMerged = branch.status === 'merged';
    const mergeY = isMerged ? endY + 40 : null;

    layouts.push({
      branch,
      forkY,
      endY,
      mergeY,
      color: isMerged ? MERGED_COLOR : ACTIVE_COLOR,
    });

    // Advance past the merge point or branch end
    currentY = mergeY ?? endY;
  }

  const mainEndY = currentY + ROW_HEIGHT;

  return { layouts, mainStartY, mainEndY, totalHeight: mainEndY + TOP_PADDING };
}

const BranchPath: FC<{ layout: BranchLayout }> = ({ layout }) => {
  const { branch, forkY, endY, mergeY, color } = layout;
  const isMerged = branch.status === 'merged';

  // Fork curve: bezier from main to branch lane
  const forkPath = [
    `M ${MAIN_X} ${forkY}`,
    `C ${MAIN_X + 50} ${forkY}, ${BRANCH_X - 50} ${forkY + CURVE_OFFSET}, ${BRANCH_X} ${forkY + CURVE_OFFSET}`,
  ].join(' ');

  // Branch vertical segment
  const branchLine = `M ${BRANCH_X} ${forkY + CURVE_OFFSET} L ${BRANCH_X} ${endY}`;

  // Merge curve: bezier from branch end back to main
  const mergePath = mergeY
    ? [
        `M ${BRANCH_X} ${endY}`,
        `C ${BRANCH_X - 50} ${mergeY}, ${MAIN_X + 50} ${mergeY}, ${MAIN_X} ${mergeY}`,
      ].join(' ')
    : '';

  // Evenly spaced commit dots along the branch segment
  const branchSegmentStart = forkY + CURVE_OFFSET;
  const commitDots = branch.threads.map((_, i) => {
    return (
      branchSegmentStart + (i + 1) * ((endY - branchSegmentStart) / (branch.threads.length + 1))
    );
  });

  return (
    <g>
      {/* Fork curve */}
      <path d={forkPath} fill="none" stroke={color} strokeWidth={2.5} />

      {/* Branch vertical line */}
      <path d={branchLine} fill="none" stroke={color} strokeWidth={2.5} />

      {/* Merge curve back to main */}
      {isMerged && mergeY && (
        <>
          <path d={mergePath} fill="none" stroke={color} strokeWidth={2.5} />
          <circle cx={MAIN_X} cy={mergeY} r={COMMIT_RADIUS} fill={color} />
        </>
      )}

      {/* Active branch: open-ended arrow tip */}
      {!isMerged && (
        <>
          <circle cx={BRANCH_X} cy={endY} r={5} fill="none" stroke={color} strokeWidth={2.5} />
          {/* Small downward ticks to suggest continuation */}
          <line
            x1={BRANCH_X}
            y1={endY + 8}
            x2={BRANCH_X}
            y2={endY + 18}
            stroke={color}
            strokeWidth={2}
            strokeDasharray="3 4"
          />
        </>
      )}

      {/* Fork dot on main */}
      <circle cx={MAIN_X} cy={forkY} r={COMMIT_RADIUS} fill={MAIN_COLOR} />

      {/* Commit dots on branch */}
      {commitDots.map((cy, i) => (
        <circle key={i} cx={BRANCH_X} cy={cy} r={BRANCH_DOT_RADIUS} fill={color} />
      ))}

      {/* Branch name label */}
      <text
        x={BRANCH_X + 18}
        y={branchSegmentStart + 6}
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
          y={branchSegmentStart + 24}
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

export const GitGraph: FC<{ project: MockProject }> = ({ project }) => {
  const { layouts, mainStartY, mainEndY, totalHeight } = computeLayout(project);

  if (project.branches.length === 0) {
    return (
      <div className="flex h-full items-center justify-center">
        <p className="text-muted-foreground text-sm">No branches yet</p>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col items-center overflow-auto p-8">
      <h2 className="text-foreground mb-6 text-lg font-medium">{project.projectName}</h2>
      <svg width={520} height={totalHeight} viewBox={`0 0 520 ${totalHeight}`} className="shrink-0">
        {/* Main vertical line */}
        <line
          x1={MAIN_X}
          y1={mainStartY}
          x2={MAIN_X}
          y2={mainEndY}
          stroke={MAIN_COLOR}
          strokeWidth={2.5}
        />

        {/* Initial commit dot (top) */}
        <circle cx={MAIN_X} cy={mainStartY} r={COMMIT_RADIUS + 1} fill={MAIN_COLOR} />

        {/* "main" label at top */}
        <text
          x={MAIN_X}
          y={mainStartY - 18}
          fill="var(--muted-foreground)"
          fontSize={13}
          fontFamily="var(--font-geist-sans), sans-serif"
          textAnchor="middle"
          fontWeight={500}
        >
          main
        </text>

        {/* HEAD dot (bottom) */}
        <circle cx={MAIN_X} cy={mainEndY} r={COMMIT_RADIUS + 1} fill={MAIN_COLOR} />

        {/* Branch paths */}
        {layouts.map((layout) => (
          <BranchPath key={layout.branch.branchId} layout={layout} />
        ))}
      </svg>
    </div>
  );
};
