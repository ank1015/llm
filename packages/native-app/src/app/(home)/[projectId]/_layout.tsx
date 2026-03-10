import { Slot, useLocalSearchParams } from 'expo-router';

import { ProjectDrawerLayout } from '@/components/projects/project-drawer-layout';

export default function ProjectLayout() {
  const params = useLocalSearchParams<{ projectId?: string | string[] }>();
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;

  if (!projectId) {
    return <Slot />;
  }

  return <ProjectDrawerLayout projectId={projectId} />;
}
