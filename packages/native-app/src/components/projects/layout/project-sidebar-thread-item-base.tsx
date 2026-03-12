import { Pressable, View } from 'react-native';

import { AppText } from '@/components/app-text';
import { cn } from '@/lib/utils';
import { appColors, appListStyles, appTypography } from '@/styles/ui';

export type ProjectSidebarThreadItemProps = {
  isActive: boolean;
  label: string;
  onContextMenuPress?: () => void;
  onDeletePress?: () => void;
  onOpenPress: () => void;
  onRenamePress?: () => void;
};

type ProjectSidebarThreadItemTriggerProps = Pick<
  ProjectSidebarThreadItemProps,
  'isActive' | 'label' | 'onOpenPress'
> & {
  onLongPress?: () => void;
};

export function ProjectSidebarThreadItemTrigger({
  isActive,
  label,
  onLongPress,
  onOpenPress,
}: ProjectSidebarThreadItemTriggerProps) {
  return (
    <Pressable
      android_ripple={{ color: 'transparent' }}
      onLongPress={onLongPress}
      onPress={onOpenPress}
      style={{ borderCurve: 'continuous' }}
    >
      <View
        className={cn(appListStyles.sidebarThreadItem, isActive && appColors.surfaceDefault)}
        style={{ minHeight: 44 }}
      >
        <AppText className={appTypography.sidebarChatTitle} ellipsizeMode="tail" numberOfLines={1}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}
