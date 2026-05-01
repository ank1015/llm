'use client';

import { cn } from '@/lib/utils';
import { useProjectPreferencesStore } from '@/stores/project-preferences-store';

type ProjectAdvancedModeSettingProps = {
  projectId: string;
};

export function ProjectAdvancedModeSetting({
  projectId,
}: Readonly<ProjectAdvancedModeSettingProps>) {
  const hasHydrated = useProjectPreferencesStore((state) => state.hasHydrated);
  const isAdvancedModeEnabled = useProjectPreferencesStore((state) =>
    state.isAdvancedModeEnabled(projectId)
  );
  const toggleProjectAdvancedMode = useProjectPreferencesStore(
    (state) => state.toggleProjectAdvancedMode
  );

  const statusLabel = hasHydrated ? (isAdvancedModeEnabled ? 'On' : 'Off') : 'Loading';

  return (
    <section className="border-home-border bg-home-panel mt-8 overflow-hidden rounded-[1.5rem] border">
      <div className="flex flex-col gap-5 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-3">
            <h2 className="text-lg font-semibold text-black dark:text-white">Advanced mode</h2>
            <span
              className={cn(
                'inline-flex h-7 items-center rounded-full px-2.5 text-[11px] font-semibold uppercase tracking-[0.14em]',
                hasHydrated && isAdvancedModeEnabled
                  ? 'bg-[#FF6363]/12 text-[#FF6363]'
                  : 'bg-black/[0.04] text-black/54 dark:bg-white/[0.06] dark:text-white/54'
              )}
            >
              {statusLabel}
            </span>
          </div>

          <p className="max-w-2xl text-sm leading-6 text-black/62 dark:text-white/60">
            The current interface is treated as advanced mode. Turn this off to prepare for a
            simpler experience in later updates.
          </p>

          <p className="text-[13px] leading-5 text-black/46 dark:text-white/44">
            This preference is stored locally in this browser for this project.
          </p>
        </div>

        {hasHydrated ? (
          <button
            type="button"
            role="switch"
            aria-checked={isAdvancedModeEnabled}
            aria-label="Toggle advanced mode"
            onClick={() => toggleProjectAdvancedMode(projectId)}
            className={cn(
              'focus-visible:ring-ring inline-flex h-9 w-16 shrink-0 cursor-pointer items-center rounded-full p-1 transition-colors focus-visible:outline-none focus-visible:ring-2',
              isAdvancedModeEnabled ? 'bg-[#FF6363]' : 'bg-black/12 dark:bg-white/14'
            )}
          >
            <span
              aria-hidden="true"
              className={cn(
                'size-7 rounded-full bg-white shadow-[0_2px_10px_rgba(0,0,0,0.16)] transition-transform',
                isAdvancedModeEnabled ? 'translate-x-7' : 'translate-x-0'
              )}
            />
          </button>
        ) : (
          <span
            aria-hidden="true"
            className="inline-flex h-9 w-16 shrink-0 animate-pulse rounded-full bg-accent"
          />
        )}
      </div>
    </section>
  );
}
