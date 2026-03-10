import { Ionicons } from '@expo/vector-icons';
import AntDesign from '@expo/vector-icons/AntDesign';
import * as Haptics from 'expo-haptics';
import { Platform, Pressable } from 'react-native';
import Animated, { FadeOut, ZoomIn } from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import { useAppTheme } from '../contexts/app-theme-context';

import type { FC } from 'react';

const StyledIonicons = withUniwind(Ionicons);
const StyledAntDesign = withUniwind(AntDesign);

export const ThemeToggle: FC = () => {
  const { toggleTheme, isLight } = useAppTheme();

  return (
    <Pressable
      android_ripple={{ color: 'transparent' }}
      hitSlop={12}
      onPress={() => {
        toggleTheme();
      }}
      onPressIn={() => {
        if (Platform.OS === 'ios') {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }}
      style={{ padding: 6 }}
    >
      {isLight ? (
        <Animated.View key="moon" entering={ZoomIn} exiting={FadeOut}>
          <StyledAntDesign name="moon" size={20} className="text-foreground" />
        </Animated.View>
      ) : (
        <Animated.View key="sun" entering={ZoomIn} exiting={FadeOut}>
          <StyledIonicons name="sunny" size={20} className="text-foreground" />
        </Animated.View>
      )}
    </Pressable>
  );
};
