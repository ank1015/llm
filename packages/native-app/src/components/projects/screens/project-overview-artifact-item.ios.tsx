import { Button as SwiftButton, ContextMenu, Host } from '@expo/ui/swift-ui';

import {
  type ProjectOverviewArtifactItemProps,
  ProjectOverviewArtifactItemTrigger,
} from './project-overview-artifact-item-base';

import { useAppTheme } from '@/contexts/app-theme-context';

export function ProjectOverviewArtifactItem({
  label,
  onDeletePress,
  onOpenPress,
  onRenamePress,
  sessionCount,
}: ProjectOverviewArtifactItemProps) {
  const { isDark } = useAppTheme();
  const trigger = (
    <ProjectOverviewArtifactItemTrigger
      label={label}
      onOpenPress={onOpenPress}
      sessionCount={sessionCount}
    />
  );

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
