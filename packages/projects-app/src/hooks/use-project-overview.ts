import { useQuery } from '@tanstack/react-query';

import * as api from '@/lib/api';
import { useArtifactDirsStore } from '@/stores/artifact-dirs-store';
import { useSessionsStore } from '@/stores/sessions-store';

export function useProjectOverview(projectId: string | undefined) {
  const setArtifactDirs = useArtifactDirsStore((s) => s.setArtifactDirs);
  const setSessions = useSessionsStore((s) => s.setSessions);

  return useQuery({
    queryKey: ['projectOverview', projectId],
    queryFn: async () => {
      const data = await api.getProjectOverview(projectId!);

      setArtifactDirs(data.artifactDirs);
      for (const dir of data.artifactDirs) {
        setSessions(dir.id, dir.sessions);
      }

      return data;
    },
    enabled: !!projectId,
  });
}
