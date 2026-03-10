import { Feather } from '@expo/vector-icons';
import { Stack } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, PageHorizontalPadding, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useUiStore } from '@/stores/ui-store';

function ThemeToggleButton() {
  const theme = useTheme();
  const themeName = useUiStore((state) => state.theme);
  const toggleTheme = useUiStore((state) => state.toggleTheme);
  const iconName = themeName === 'dark' ? 'sun' : 'moon';
  const nextThemeLabel = themeName === 'dark' ? 'light' : 'dark';

  return (
    <Pressable
      accessibilityHint={`Switch to ${nextThemeLabel} mode`}
      accessibilityLabel={`Use ${nextThemeLabel} theme`}
      accessibilityRole="button"
      onPress={toggleTheme}
      style={({ pressed }) => [
        styles.toggleButton,
        {
          backgroundColor: pressed ? theme.homeHover : theme.homePanel,
          borderColor: theme.homeBorder,
        },
      ]}
    >
      <Feather color={theme.text} name={iconName} size={17} />
    </Pressable>
  );
}

export default function HomeScreen() {
  const theme = useTheme();

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Projects',
          headerRight: () => <ThemeToggleButton />,
        }}
      />
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.scrollContent}
        style={{ backgroundColor: theme.homePage }}
      >
        <View style={styles.centerWrap}>
          <ThemedView
            style={[
              styles.placeholderCard,
              {
                backgroundColor: theme.homePanel,
                borderColor: theme.homeBorder,
              },
            ]}
          >
            <ThemedText selectable={false} type="subtitle">
              Mobile client
            </ThemedText>
            <ThemedText selectable={false} style={styles.copy} themeColor="textSecondary">
              Shared data, stores, and theme wiring are in place. Native screens can build on this
              shell now.
            </ThemedText>
          </ThemedView>
        </View>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  centerWrap: {
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  copy: {
    lineHeight: 22,
    maxWidth: 420,
  },
  placeholderCard: {
    borderRadius: 28,
    borderWidth: 1,
    gap: Spacing.two,
    maxWidth: MaxContentWidth,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.five,
    width: '100%',
  },
  scrollContent: {
    flex: 1,
    paddingBottom: Spacing.six,
    paddingHorizontal: PageHorizontalPadding,
    paddingTop: Spacing.six,
  },
  toggleButton: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    height: 36,
    justifyContent: 'center',
    width: 36,
  },
});
