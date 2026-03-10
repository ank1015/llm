import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import type { ComponentProps, FC } from 'react';

import { AppText } from '@/components/app-text';
import { ThemeToggle } from '@/components/theme-toggle';
import { useSidebarStore, useUiStore } from '@/stores';

const StyledFeather = withUniwind(Feather);

type HeaderIconButtonProps = {
  accessibilityLabel: string;
  icon: ComponentProps<typeof Feather>['name'];
  onPress: () => void;
};

const HeaderIconButton: FC<HeaderIconButtonProps> = ({ accessibilityLabel, icon, onPress }) => {
  return (
    <Pressable
      android_ripple={{ color: 'transparent' }}
      accessibilityLabel={accessibilityLabel}
      hitSlop={12}
      onPress={onPress}
      onPressIn={() => {
        if (Platform.OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }}
      style={{ padding: 6 }}
    >
      <StyledFeather className="text-foreground" name={icon} size={22} />
    </Pressable>
  );
};

export const ProjectHeaderLeft: FC = () => {
  const toggleMobileSidebar = useUiStore((state) => state.toggleMobileSidebar);

  return (
    <HeaderIconButton
      accessibilityLabel="Open project sidebar"
      icon="menu"
      onPress={toggleMobileSidebar}
    />
  );
};

export const ProjectHeaderTitle: FC = () => {
  const projectName = useSidebarStore((state) => state.projectName);

  return (
    <View className="flex-row items-center justify-center gap-1" style={{ maxWidth: 220 }}>
      <AppText
        className="text-lg font-semibold text-foreground"
        numberOfLines={1}
        style={{ flexShrink: 1 }}
      >
        {projectName ?? 'Project'}
      </AppText>
      <StyledFeather className="text-foreground/70" name="chevron-down" size={16} />
    </View>
  );
};

export const ProjectScreenHeader: FC = () => {
  const insets = useSafeAreaInsets();

  return (
    <View
      className="bg-background px-5"
      style={{
        paddingTop: insets.top + 8,
        paddingBottom: 12,
      }}
    >
      <View className="flex-row items-center">
        <View className="items-start" style={{ width: 40 }}>
          <ProjectHeaderLeft />
        </View>

        <View className="flex-1 items-center justify-center px-3">
          <ProjectHeaderTitle />
        </View>

        <View className="items-end" style={{ width: 40 }}>
          <ThemeToggle />
        </View>
      </View>
    </View>
  );
};
