import {
  type ProjectSidebarThreadItemProps,
  ProjectSidebarThreadItemTrigger,
} from './project-sidebar-thread-item-base';

export function ProjectSidebarThreadItem({
  isActive,
  label,
  onContextMenuPress,
  onOpenPress,
}: ProjectSidebarThreadItemProps) {
  return (
    <ProjectSidebarThreadItemTrigger
      isActive={isActive}
      label={label}
      onLongPress={onContextMenuPress}
      onOpenPress={onOpenPress}
    />
  );
}
