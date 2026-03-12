import Feather from '@expo/vector-icons/Feather';
import { Pressable, View } from 'react-native';
import { withUniwind } from 'uniwind';

import { AppText } from '@/components/app-text';
import { cn } from '@/lib/utils';
import { appColors, appListStyles, appSizes } from '@/styles/ui';

const StyledFeather = withUniwind(Feather);

export type ProjectSidebarArtifactItemProps = {
  expanded: boolean;
  isActive: boolean;
  label: string;
  onContextMenuPress?: () => void;
  onDeletePress?: () => void;
  onOpenPress: () => void;
  onRenamePress?: () => void;
  onToggle: () => void;
};

type ProjectSidebarArtifactItemTriggerProps = Pick<
  ProjectSidebarArtifactItemProps,
  'expanded' | 'isActive' | 'label' | 'onOpenPress' | 'onToggle'
> & {
  onLongPress?: () => void;
};

export function ProjectSidebarArtifactItemTrigger({
  expanded,
  isActive,
  label,
  onLongPress,
  onOpenPress,
  onToggle,
}: ProjectSidebarArtifactItemTriggerProps) {
  return (
    <View
      className={cn(
        appListStyles.filesystemRow,
        appListStyles.sidebarPrimaryRow,
        'gap-4',
        appListStyles.sidebarItemSurface,
        isActive && appColors.surfaceDefault
      )}
      style={{ minHeight: 44 }}
    >
      <Pressable
        android_ripple={{ color: 'transparent' }}
        hitSlop={12}
        onLongPress={onLongPress}
        onPress={onToggle}
        style={{ borderCurve: 'continuous', margin: -6, paddingLeft: 10, paddingRight: 4 }}
      >
        <StyledFeather
          className="text-foreground"
          name={expanded ? 'chevron-down' : 'chevron-right'}
          size={appSizes.iconLg}
        />
      </Pressable>
      <Pressable
        android_ripple={{ color: 'transparent' }}
        hitSlop={8}
        onLongPress={onLongPress}
        onPress={onOpenPress}
        style={{ borderCurve: 'continuous', flex: 1, paddingVertical: 4 }}
      >
        <AppText className="text-[16px] font-semibold text-foreground" numberOfLines={1}>
          {label}
        </AppText>
      </Pressable>
    </View>
  );
}
