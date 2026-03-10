import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#171717',
    textSecondary: '#737373',
    background: '#ffffff',
    foreground: '#171717',
    tertiary: '#f3f3f3',
    card: '#ffffff',
    primary: '#171717',
    primaryForeground: '#fafafa',
    secondary: '#fafafa',
    secondaryForeground: '#171717',
    muted: '#f5f5f5',
    mutedForeground: '#737373',
    accent: '#efefef',
    accentForeground: '#171717',
    border: '#e5e5e5',
    input: '#e5e5e5',
    ring: '#b3b3b3',
    homePage: '#ffffff',
    homePanel: '#f9f9f9',
    homeBorder: '#e5e5e5',
    homeHover: '#efefef',
    homeInput: '#ffffff',
    backgroundElement: '#f9f9f9',
    backgroundSelected: '#efefef',
  },
  dark: {
    text: '#fafafa',
    textSecondary: '#a3a3a3',
    background: '#212121',
    foreground: '#fafafa',
    tertiary: '#313131',
    card: '#181818',
    primary: '#ededed',
    primaryForeground: '#171717',
    secondary: '#303030',
    secondaryForeground: '#fafafa',
    muted: '#303030',
    mutedForeground: '#a3a3a3',
    accent: '#303030',
    accentForeground: '#fafafa',
    border: '#2e2e2e',
    input: '#303030',
    ring: '#8a8a8a',
    homePage: '#212121',
    homePanel: '#181818',
    homeBorder: '#2e2e2e',
    homeHover: '#303030',
    homeInput: '#303030',
    backgroundElement: '#181818',
    backgroundSelected: '#303030',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 880;
export const PageHorizontalPadding =
  Platform.select({
    ios: Spacing.four,
    android: Spacing.four,
    default: Spacing.four,
  }) ?? Spacing.four;
