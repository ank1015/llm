import { createContext, type ReactNode, useContext } from 'react';

export type ProjectOverviewRefreshMode = 'initial' | 'refresh';

type ProjectShellContextValue = {
  projectId: string;
  refreshOverview: (mode?: ProjectOverviewRefreshMode) => Promise<void>;
};

const ProjectShellContext = createContext<ProjectShellContextValue | undefined>(undefined);

export function ProjectShellProvider({
  children,
  value,
}: {
  children: ReactNode;
  value: ProjectShellContextValue;
}) {
  return <ProjectShellContext.Provider value={value}>{children}</ProjectShellContext.Provider>;
}

export function useProjectShell(): ProjectShellContextValue {
  const context = useContext(ProjectShellContext);

  if (!context) {
    throw new Error('useProjectShell must be used within ProjectShellProvider');
  }

  return context;
}
