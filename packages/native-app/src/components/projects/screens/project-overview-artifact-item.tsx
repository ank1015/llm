import {
  type ProjectOverviewArtifactItemProps,
  ProjectOverviewArtifactItemTrigger,
} from './project-overview-artifact-item-base';

export function ProjectOverviewArtifactItem({
  label,
  onContextMenuPress,
  onOpenPress,
  sessionCount,
}: ProjectOverviewArtifactItemProps) {
  return (
    <ProjectOverviewArtifactItemTrigger
      label={label}
      onLongPress={onContextMenuPress}
      onOpenPress={onOpenPress}
      sessionCount={sessionCount}
    />
  );
}
