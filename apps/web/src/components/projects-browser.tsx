"use client";

import { ProjectsShowcase } from "@/components/projects-showcase";

type ProjectVisibilityFilter = "active" | "archived";

function getTabClassName(
  isActive: boolean,
) {
  return isActive
    ? "text-sm font-medium tracking-[-0.02em] text-[#FF6363]"
    : "text-sm font-medium tracking-[-0.02em] text-black/45 transition-colors hover:text-black/70 dark:text-white/42 dark:hover:text-white/68";
}

export function ProjectsBrowser({
  activeTab,
  onTabChange,
  onCreateProject,
}: {
  activeTab: ProjectVisibilityFilter;
  onTabChange: (tab: ProjectVisibilityFilter) => void;
  onCreateProject: () => void;
}) {
  return (
    <div className="relative mx-auto flex w-full max-w-[72rem] flex-col gap-10">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -top-8 right-0 h-40 w-40 rounded-full bg-black/[0.03] blur-3xl dark:bg-white/[0.05]"
      />

      <div className="flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-center gap-5">
          <button
            type="button"
            onClick={() => onTabChange("active")}
            className={getTabClassName(activeTab === "active")}
          >
            Active
          </button>
          <button
            type="button"
            onClick={() => onTabChange("archived")}
            className={getTabClassName(activeTab === "archived")}
          >
            Archived
          </button>
        </div>

        <div className="sm:ml-auto sm:max-w-xl sm:text-right">
          <p className="text-xs font-medium uppercase tracking-[0.28em] text-black/45 dark:text-white/42">
            Library
          </p>
          <h1 className="mt-3 text-4xl font-medium tracking-[-0.05em] text-black sm:text-5xl dark:text-white">
            Projects
          </h1>
        </div>
      </div>

      <ProjectsShowcase filter={activeTab} onCreateProject={onCreateProject} />
    </div>
  );
}
