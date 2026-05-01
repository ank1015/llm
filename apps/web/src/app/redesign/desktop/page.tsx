'use client';

import { DashboardSquare01Icon, LeftToRightListBulletIcon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import Image from 'next/image';
import { useCallback, useEffect, useRef, useState } from 'react';

import { ThemeToggle } from '@/components/theme-toggle';
import { useDesktopListingQuery } from '@/hooks/api';
import { cn } from '@/lib/utils';

import type { DesktopEntryDto } from '@/lib/client-api';

const FOLDER_ICON_SRC = '/macos/Folder.png';
const FILE_ICON_SRC = '/macos/File.png';

const HISTORY_LIMIT = 64;
const DEFAULT_LEFT_PANE_RATIO = 0.6;
const MIN_PANE_RATIO = 0.25;
const MAX_PANE_RATIO = 0.75;

type DoubleClickHandler = (entry: DesktopEntryDto) => void;
type FinderViewMode = 'tiles' | 'list';

export default function MacFinderRedesignPage() {
  const [history, setHistory] = useState<string[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [pathOverride, setPathOverride] = useState<string | undefined>(undefined);
  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<FinderViewMode>('tiles');
  const [searchQuery, setSearchQuery] = useState('');

  const listingQuery = useDesktopListingQuery({
    ...(pathOverride !== undefined ? { path: pathOverride } : {}),
  });

  const listing = listingQuery.data;
  const currentPath = listing?.path;

  const navigateTo = useCallback(
    (nextPath: string) => {
      setSelectedPath(null);
      setPathOverride(nextPath);
      setHistory((prev) => {
        const trimmed =
          historyIndex >= 0 ? prev.slice(0, historyIndex + 1) : currentPath ? [currentPath] : [];
        if (trimmed[trimmed.length - 1] === nextPath) {
          setHistoryIndex(trimmed.length - 1);
          return trimmed;
        }
        const next = [...trimmed, nextPath];
        const overflow = Math.max(0, next.length - HISTORY_LIMIT);
        const bounded = next.slice(overflow);
        setHistoryIndex(bounded.length - 1);
        return bounded;
      });
    },
    [currentPath, historyIndex]
  );

  const handleEntryDoubleClick: DoubleClickHandler = useCallback(
    (entry) => {
      if (entry.type !== 'directory') {
        return;
      }
      navigateTo(entry.path);
    },
    [navigateTo]
  );

  const onBack = useCallback(() => {
    if (historyIndex <= 0) {
      return;
    }
    const nextIndex = historyIndex - 1;
    setHistoryIndex(nextIndex);
    setSelectedPath(null);
    setPathOverride(history[nextIndex]);
  }, [history, historyIndex]);

  const onForward = useCallback(() => {
    if (historyIndex >= history.length - 1) {
      return;
    }
    const nextIndex = historyIndex + 1;
    setHistoryIndex(nextIndex);
    setSelectedPath(null);
    setPathOverride(history[nextIndex]);
  }, [history, historyIndex]);

  const canGoBack = historyIndex > 0;
  const canGoForward = historyIndex >= 0 && historyIndex < history.length - 1;
  const visibleEntries =
    searchQuery.trim().length === 0
      ? (listing?.entries ?? [])
      : (listing?.entries ?? []).filter((entry) =>
          entry.name.toLowerCase().includes(searchQuery.trim().toLowerCase())
        );

  const onBackgroundClick = useCallback(() => {
    setSelectedPath(null);
  }, []);

  return (
    <main className="flex h-[100dvh] w-full flex-col overflow-hidden bg-white text-[#1f1f1f] dark:bg-[#202021] dark:text-white">
      <FinderToolbar
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        onBack={onBack}
        onForward={onForward}
        title={listing?.name ?? 'Desktop'}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        isFetching={listingQuery.isFetching}
      />

      <DesktopSplitPane>
        <FinderBody
          error={listingQuery.error}
          isLoading={listingQuery.isLoading}
          entries={visibleEntries}
          viewMode={viewMode}
          selectedPath={selectedPath}
          onSelect={(entry) => setSelectedPath(entry.path)}
          onActivate={handleEntryDoubleClick}
          onBackgroundClick={onBackgroundClick}
        />
      </DesktopSplitPane>
    </main>
  );
}

function DesktopSplitPane({ children }: { children: React.ReactNode }) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [leftPaneRatio, setLeftPaneRatio] = useState(DEFAULT_LEFT_PANE_RATIO);
  const [isResizing, setIsResizing] = useState(false);

  useEffect(() => {
    if (!isResizing) {
      return;
    }

    function handleMouseMove(event: MouseEvent) {
      const container = containerRef.current;
      if (!container) {
        return;
      }

      const rect = container.getBoundingClientRect();
      const nextRatio = (event.clientX - rect.left) / rect.width;
      setLeftPaneRatio(Math.min(MAX_PANE_RATIO, Math.max(MIN_PANE_RATIO, nextRatio)));
    }

    function handleMouseUp() {
      setIsResizing(false);
    }

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [isResizing]);

  return (
    <div ref={containerRef} className="flex min-h-0 flex-1 overflow-hidden">
      <section
        className="flex min-w-0 flex-col overflow-hidden"
        style={{ flexBasis: `${leftPaneRatio * 100}%` }}
      >
        {children}
      </section>

      <div
        role="separator"
        aria-label="Resize desktop panels"
        aria-orientation="vertical"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(leftPaneRatio * 100)}
        onMouseDown={(event) => {
          event.preventDefault();
          setIsResizing(true);
        }}
        className="relative flex w-3 shrink-0 cursor-col-resize items-center justify-center bg-white dark:bg-[#202021]"
      >
        <div className="h-full w-px bg-black/8 dark:bg-white/10" />
        <div className="absolute h-10 w-1 rounded-full bg-black/18 dark:bg-white/22" />
      </div>

      <aside className="min-w-0 flex-1 bg-white dark:bg-[#202021]" aria-label="Desktop preview panel" />
    </div>
  );
}

function FinderToolbar({
  canGoBack,
  canGoForward,
  onBack,
  onForward,
  title,
  viewMode,
  onViewModeChange,
  searchQuery,
  onSearchQueryChange,
  isFetching,
}: {
  canGoBack: boolean;
  canGoForward: boolean;
  onBack: () => void;
  onForward: () => void;
  title: string;
  viewMode: FinderViewMode;
  onViewModeChange: (mode: FinderViewMode) => void;
  searchQuery: string;
  onSearchQueryChange: (query: string) => void;
  isFetching: boolean;
}) {
  return (
    <div className="relative flex h-14 shrink-0 items-start bg-white px-2 pt-2 dark:bg-[#202021]">
      <div className="relative z-10 flex w-full items-center gap-3">
        <div className="flex h-8 w-[66px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#F9F9F9] shadow-[0_4px_16px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.035] dark:bg-[#1A1A1A] dark:ring-white/[0.06]">
          <ToolbarButton onClick={onBack} disabled={!canGoBack} ariaLabel="Back">
            <ChevronIcon direction="left" />
          </ToolbarButton>
          <ToolbarButton onClick={onForward} disabled={!canGoForward} ariaLabel="Forward">
            <ChevronIcon direction="right" />
          </ToolbarButton>
        </div>

        <h1 className="min-w-0 flex-1 truncate text-[14px] font-semibold tracking-[-0.01em] text-black/72 dark:text-white/76">
          {title} <span className="font-semibold text-black/60 dark:text-white/55">— Local</span>
        </h1>

        <ViewModeSwitch mode={viewMode} onChange={onViewModeChange} />

        <SearchField value={searchQuery} onChange={onSearchQueryChange} />

        <div className="flex shrink-0 items-center">
          {isFetching ? <Spinner /> : <span className="size-3" aria-hidden="true" />}
        </div>

        <div className="flex shrink-0 items-center">
          <ThemeToggle />
        </div>
      </div>
    </div>
  );
}

function ToolbarButton({
  children,
  disabled,
  onClick,
  ariaLabel,
}: {
  children: React.ReactNode;
  disabled?: boolean;
  onClick: () => void;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      className={cn(
        'flex size-7 cursor-pointer items-center justify-center rounded-none text-black transition dark:text-white',
        'hover:bg-black/[0.045] hover:text-black dark:hover:bg-white/[0.08] dark:hover:text-white',
        'disabled:cursor-not-allowed disabled:opacity-25 disabled:hover:bg-transparent'
      )}
    >
      {children}
    </button>
  );
}

function ChevronIcon({ direction }: { direction: 'left' | 'right' | 'up' }) {
  const rotate = direction === 'left' ? 90 : direction === 'right' ? -90 : 180;
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="none"
      style={{ transform: `rotate(${rotate}deg)` }}
      aria-hidden="true"
    >
      <path
        d="M4 6l4 4 4-4"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner() {
  return (
    <span
      className="size-3 animate-spin rounded-full border-[1.5px] border-black/25 border-t-transparent dark:border-white/30 dark:border-t-transparent"
      role="status"
      aria-label="Loading"
    />
  );
}

function ViewModeSwitch({
  mode,
  onChange,
}: {
  mode: FinderViewMode;
  onChange: (mode: FinderViewMode) => void;
}) {
  return (
    <div
      className="flex h-8 shrink-0 gap-1 items-center rounded-full bg-[#F9F9F9] px-2 shadow-[0_4px_16px_rgba(0,0,0,0.08)] ring-1 ring-black/[0.035] dark:bg-[#1A1A1A] dark:ring-white/[0.06]"
      aria-label="View options"
    >
      <ViewModeButton
        label="Tiles"
        isActive={mode === 'tiles'}
        onClick={() => onChange('tiles')}
        icon={DashboardSquare01Icon}
      />
      <ViewModeButton
        label="List"
        isActive={mode === 'list'}
        onClick={() => onChange('list')}
        icon={LeftToRightListBulletIcon}
      />
    </div>
  );
}

function ViewModeButton({
  label,
  isActive,
  onClick,
  icon,
}: {
  label: string;
  isActive: boolean;
  onClick: () => void;
  icon: Parameters<typeof HugeiconsIcon>[0]['icon'];
}) {
  return (
    <button
      type="button"
      aria-label={label}
      aria-pressed={isActive}
      onClick={onClick}
      className={cn(
        'flex size-6 px-1 items-center justify-center rounded-md transition',
        isActive
          ? 'rounded-full bg-black/[0.08] text-black/72 dark:bg-white/[0.14] dark:text-white/86'
          : 'text-black/50 hover:bg-black/[0.05] hover:text-black/70 dark:text-white/50 dark:hover:bg-white/[0.1] dark:hover:text-white/78 hover:rounded-full'
      )}
    >
      <HugeiconsIcon icon={icon} size={19} color="currentColor" strokeWidth={1.8} />
    </button>
  );
}

function SearchField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="relative h-8 w-[250px] shrink-0">
      <span className="sr-only">Search</span>
      <span
        className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-black/34 dark:text-white/35"
        aria-hidden="true"
      >
        <SearchIcon />
      </span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder="Search"
        className="h-full w-full rounded-full border-0 bg-[#F9F9F9] pl-8 pr-3 text-[13px] text-black/70 shadow-[0_4px_16px_rgba(0,0,0,0.08)] outline-none ring-1 ring-black/[0.035] transition placeholder:text-black/38 focus:bg-white focus:ring-black/[0.08] dark:bg-[#1A1A1A] dark:text-white/80 dark:ring-white/[0.06] dark:placeholder:text-white/38 dark:focus:bg-[#1A1A1A]"
      />
    </label>
  );
}

function SearchIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 16 16" fill="none">
      <path
        d="M7.25 12.25a5 5 0 1 1 0-10 5 5 0 0 1 0 10ZM11 11l3 3"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function FinderBody({
  error,
  isLoading,
  entries,
  viewMode,
  selectedPath,
  onSelect,
  onActivate,
  onBackgroundClick,
}: {
  error: unknown;
  isLoading: boolean;
  entries: DesktopEntryDto[];
  viewMode: FinderViewMode;
  selectedPath: string | null;
  onSelect: (entry: DesktopEntryDto) => void;
  onActivate: DoubleClickHandler;
  onBackgroundClick: () => void;
}) {
  if (isLoading) {
    return <FinderEmptyState message="Loading folder..." />;
  }

  if (error instanceof Error) {
    return <FinderEmptyState message={error.message} variant="error" />;
  }

  if (entries.length === 0) {
    return <FinderEmptyState message="This folder is empty." />;
  }

  return (
    <div
      className={cn(
        'flex-1 overflow-y-auto bg-white dark:bg-[#202021]',
        viewMode === 'tiles' ? 'px-7 py-3' : 'px-2 py-2'
      )}
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onBackgroundClick();
        }
      }}
    >
      {viewMode === 'tiles' ? (
        <FinderTiles
          entries={entries}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onActivate={onActivate}
        />
      ) : (
        <FinderList
          entries={entries}
          selectedPath={selectedPath}
          onSelect={onSelect}
          onActivate={onActivate}
        />
      )}
    </div>
  );
}

function FinderTiles({
  entries,
  selectedPath,
  onSelect,
  onActivate,
}: {
  entries: DesktopEntryDto[];
  selectedPath: string | null;
  onSelect: (entry: DesktopEntryDto) => void;
  onActivate: DoubleClickHandler;
}) {
  return (
    <div
      className="grid gap-x-3 gap-y-2"
      style={{ gridTemplateColumns: 'repeat(auto-fill, 96px)' }}
    >
      {entries.map((entry) => (
        <FinderItem
          key={entry.path}
          entry={entry}
          isSelected={entry.path === selectedPath}
          onSelect={() => onSelect(entry)}
          onActivate={() => onActivate(entry)}
        />
      ))}
    </div>
  );
}

function FinderList({
  entries,
  selectedPath,
  onSelect,
  onActivate,
}: {
  entries: DesktopEntryDto[];
  selectedPath: string | null;
  onSelect: (entry: DesktopEntryDto) => void;
  onActivate: DoubleClickHandler;
}) {
  return (
    <div className="w-full overflow-hidden">
      {entries.map((entry) => (
        <button
          key={entry.path}
          type="button"
          onClick={() => onSelect(entry)}
          onDoubleClick={() => onActivate(entry)}
          className={cn(
            'flex h-9 w-full items-center gap-3 rounded-md px-3 text-left text-[13px] transition',
            entry.path === selectedPath
              ? 'text-black/88 dark:text-white/90'
              : 'text-black/78 hover:bg-black/[0.04] dark:text-white/78 dark:hover:bg-white/[0.07]'
          )}
        >
          <div
            className={cn(
              'flex size-9 shrink-0 items-center justify-center rounded-lg transition',
              entry.path === selectedPath
                ? 'bg-[#E6E6E6] dark:bg-[#343434]'
                : ''
            )}
          >
            <EntryIcon entry={entry} size={22} />
          </div>
          <span
            className={cn(
              'min-w-0 flex-1 truncate rounded-full py-0.5',
              entry.path === selectedPath
                ? 'bg-[#0064E1] px-2.5 text-white dark:bg-[#0059D1]'
                : ''
            )}
          >
            {entry.name}
          </span>
        </button>
      ))}
    </div>
  );
}

function FinderEmptyState({
  message,
  variant = 'info',
}: {
  message: string;
  variant?: 'info' | 'error';
}) {
  return (
    <div className="flex flex-1 items-center justify-center px-6 py-12 text-center">
      <p
        className={cn(
          'max-w-sm text-sm',
          variant === 'error' ? 'text-[#c13e3e] dark:text-[#ff8a8a]' : 'text-foreground/55'
        )}
      >
        {message}
      </p>
    </div>
  );
}

function FinderItem({
  entry,
  isSelected,
  onSelect,
  onActivate,
}: {
  entry: DesktopEntryDto;
  isSelected: boolean;
  onSelect: () => void;
  onActivate: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      onDoubleClick={onActivate}
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          onActivate();
        }
      }}
      className="group flex flex-col items-center gap-1 rounded-lg px-2 pb-2 pt-3 text-center outline-none transition focus-visible:ring-2 focus-visible:ring-[#0064E1]/60 dark:focus-visible:ring-[#0059D1]/60"
    >
      <div
        className={cn(
          'flex h-[58px] w-[76px] max-w-[76px] shrink-0 items-center justify-center rounded-lg transition',
          isSelected
            ? 'bg-[#E6E6E6] dark:bg-[#343434]'
            : 'group-hover:bg-black/[0.04] bg-transparent dark:group-hover:bg-white/[0.07]'
        )}
      >
        <EntryIcon entry={entry} />
      </div>

      <span
        className={cn(
          'mt-1 max-w-[96px] truncate px-2 py-0.5 text-[11px] leading-tight',
          isSelected
            ? 'rounded-full bg-[#0064E1] text-white dark:bg-[#0059D1]'
            : 'text-black/82 group-hover:rounded-full group-hover:bg-black/[0.04] dark:text-white/82 dark:group-hover:bg-white/[0.07]'
        )}
        title={entry.name}
      >
        {entry.name}
      </span>
    </button>
  );
}

function EntryIcon({ entry, size = 52 }: { entry: DesktopEntryDto; size?: number }) {
  const src = entry.type === 'directory' ? FOLDER_ICON_SRC : FILE_ICON_SRC;
  return (
    <Image
      src={src}
      alt=""
      width={size}
      height={size}
      draggable={false}
      className="select-none drop-shadow-sm"
      style={{ width: entry.type === 'directory' ? 1.15*size : 0.75*size, height: size }}
    />
  );
}
