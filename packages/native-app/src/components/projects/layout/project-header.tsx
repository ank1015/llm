import Feather from '@expo/vector-icons/Feather';
import * as Haptics from 'expo-haptics';
import { useNavigation, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import type { DrawerNavigationProp } from '@react-navigation/drawer';
import type { ParamListBase } from '@react-navigation/native';
import type { ComponentProps, FC } from 'react';

import { AppText } from '@/components/app-text';
import { ThemeToggle } from '@/components/theme-toggle';
import { useSidebarStore } from '@/stores';

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
        if (process.env.EXPO_OS === 'ios') {
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
  const navigation = useNavigation<DrawerNavigationProp<ParamListBase>>();

  return (
    <HeaderIconButton
      accessibilityLabel="Open project sidebar"
      icon="menu"
      onPress={() => {
        navigation.toggleDrawer();
      }}
    />
  );
};

export const ProjectHeaderTitle: FC = () => {
  const projectName = useSidebarStore((state) => state.projectName);
  const router = useRouter();

  return (
    <Pressable
      android_ripple={{ color: 'transparent' }}
      hitSlop={12}
      onPress={() => {
        router.replace('/');
      }}
      onPressIn={() => {
        if (process.env.EXPO_OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }}
      style={{ maxWidth: 220, paddingHorizontal: 6, paddingVertical: 4 }}
    >
      <View className="flex-row items-center justify-center gap-1">
        <AppText
          className="text-lg font-semibold text-foreground"
          numberOfLines={1}
          style={{ flexShrink: 1 }}
        >
          {projectName ?? 'Project'}
        </AppText>
        <StyledFeather className="text-foreground/70" name="chevron-down" size={16} />
      </View>
    </Pressable>
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
