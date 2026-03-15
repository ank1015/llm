import Feather from '@expo/vector-icons/Feather';
import { Skeleton } from 'heroui-native';
import { Pressable, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import { AppText } from '@/components/app-text';
import { appColors, appSizes } from '@/styles/ui';

const StyledFeather = withUniwind(Feather);

function getItemEntering(index: number) {
  return FadeInDown.duration(260)
    .delay(index * 60)
    .easing(Easing.out(Easing.ease));
}

export type ProjectOverviewArtifactItemProps = {
  label: string;
  onContextMenuPress?: () => void;
  onDeletePress?: () => void;
  onOpenPress: () => void;
  onRenamePress?: () => void;
  sessionCount: number;
};

type ProjectOverviewArtifactItemTriggerProps = Pick<
  ProjectOverviewArtifactItemProps,
  'label' | 'onOpenPress' | 'sessionCount'
> & {
  onLongPress?: () => void;
};

export function ProjectOverviewArtifactItemTrigger({
  label,
  onLongPress,
  onOpenPress,
  sessionCount,
}: ProjectOverviewArtifactItemTriggerProps) {
  return (
    <Pressable
      android_ripple={{ color: 'transparent' }}
      delayLongPress={250}
      onLongPress={onLongPress}
      onPress={onOpenPress}
      style={{ borderCurve: 'continuous', paddingVertical: 2 }}
    >
      <View className="flex-row items-center gap-4 py-1">
        <StyledFeather className={appColors.foregroundMuted} name="folder" size={appSizes.iconLg} />
        <View className="flex-1">
          <AppText className="text-[18px] font-medium text-foreground">{label}</AppText>
        </View>
        <View className="flex-row items-center gap-2">
          <AppText className="text-[17px] font-medium text-muted">{sessionCount}</AppText>
          <StyledFeather
            className={appColors.foregroundSoft}
            name="chevron-right"
            size={appSizes.iconSm}
          />
        </View>
      </View>
    </Pressable>
  );
}

export function ProjectOverviewArtifactItemSkeleton({ index }: { index: number }) {
  return (
    <Animated.View entering={getItemEntering(index)}>
      <View className="flex-row items-center gap-4 py-1">
        <Skeleton className="h-6 w-6 rounded-md" />
        <View className="flex-1">
          <Skeleton className="h-6 w-2/3 rounded-md" />
        </View>
        <View className="flex-row items-center gap-2">
          <Skeleton className="h-5 w-5 rounded-md" />
          <Skeleton className="h-5 w-4 rounded-md" />
        </View>
      </View>
    </Animated.View>
  );
}
