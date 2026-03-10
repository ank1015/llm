import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useThemeColor, useToast } from 'heroui-native';
import { useCallback, useEffect } from 'react';
import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { ThemeToggle } from '@/components/theme-toggle';
import { useAppTheme } from '@/contexts/app-theme-context';

export default function Layout() {
  const { isDark } = useAppTheme();
  const [themeColorForeground, themeColorBackground] = useThemeColor(['foreground', 'background']);

  const reducedMotion = useReducedMotion();
  const { toast } = useToast();

  useEffect(() => {
    if (reducedMotion) {
      toast.show({
        duration: 'persistent',
        variant: 'warning',
        label: 'Reduce motion enabled',
        description: 'All animations will be disabled',
        actionLabel: 'Close',
        onActionPress: ({ hide }) => hide(),
      });
    }
  }, [reducedMotion, toast]);

  const renderThemeToggle = useCallback(() => <ThemeToggle />, []);

  return (
    <View className="flex-1 bg-background">
      <StatusBar animated style={isDark ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerTitleAlign: 'center',
          headerTransparent: false,
          headerShadowVisible: false,
          headerTintColor: themeColorForeground,
          headerStyle: {
            backgroundColor: themeColorBackground,
          },
          headerTitleStyle: {
            fontFamily: 'Inter_600SemiBold',
          },
          headerRight: renderThemeToggle,
          gestureEnabled: true,
          gestureDirection: 'horizontal',
          fullScreenGestureEnabled: true,
          contentStyle: {
            backgroundColor: themeColorBackground,
          },
        }}
      >
        <Stack.Screen name="index" options={{ headerShown: false }} />
        <Stack.Screen name="[projectId]" options={{ headerShown: false }} />
      </Stack>
    </View>
  );
}
