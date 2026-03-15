import { Button as SwiftButton, ContextMenu, Host } from '@expo/ui/swift-ui';

import { type ProjectCardProps, ProjectCardTrigger } from './project-card-base';

import { useAppTheme } from '@/contexts/app-theme-context';

export function ProjectCard({
  index,
  onDeletePress,
  onOpenPress,
  onRenamePress,
  project,
}: ProjectCardProps) {
  const { isDark } = useAppTheme();
  const trigger = <ProjectCardTrigger index={index} onOpenPress={onOpenPress} project={project} />;

  if (!onDeletePress && !onRenamePress) {
    return trigger;
  }

  return (
    <Host colorScheme={isDark ? 'dark' : 'light'} matchContents>
      <ContextMenu>
        <ContextMenu.Items>
          {onRenamePress ? (
            <SwiftButton label="Rename" onPress={onRenamePress} systemImage="pencil" />
          ) : null}
          {onDeletePress ? (
            <SwiftButton
              label="Delete"
              onPress={onDeletePress}
              role="destructive"
              systemImage="trash"
            />
          ) : null}
        </ContextMenu.Items>
        <ContextMenu.Trigger>{trigger}</ContextMenu.Trigger>
      </ContextMenu>
    </Host>
  );
}
