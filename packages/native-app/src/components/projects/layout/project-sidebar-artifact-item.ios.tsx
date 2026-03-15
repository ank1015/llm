import {
  type ProjectSidebarArtifactItemProps,
  ProjectSidebarArtifactItemTrigger,
} from './project-sidebar-artifact-item-base';

export function ProjectSidebarArtifactItem({
  expanded,
  isActive,
  label,
  onContextMenuPress,
  onOpenPress,
  onToggle,
}: ProjectSidebarArtifactItemProps) {
  return (
    <ProjectSidebarArtifactItemTrigger
      expanded={expanded}
      isActive={isActive}
      label={label}
      onLongPress={onContextMenuPress}
      onOpenPress={onOpenPress}
      onToggle={onToggle}
    />
  );
}
