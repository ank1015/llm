import { useHeaderHeight } from '@react-navigation/elements';
import { cn } from 'heroui-native';
import { forwardRef } from 'react';
import { ScrollView, type ScrollViewProps } from 'react-native';
import Animated, { type AnimatedProps } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { PropsWithChildren } from 'react';

import { appColors, appLayout, appSpacing } from '@/styles/ui';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

interface Props extends AnimatedProps<ScrollViewProps> {
  className?: string;
  contentContainerClassName?: string;
}

export const ScreenScrollView = forwardRef<ScrollView, PropsWithChildren<Props>>(
  ({ children, className, contentContainerClassName, ...props }, ref) => {
    const insets = useSafeAreaInsets();
    const headerHeight = useHeaderHeight();

    return (
      <AnimatedScrollView
        ref={ref}
        className={cn(appColors.background, className)}
        contentContainerClassName={cn(appLayout.screenHorizontalPadding, contentContainerClassName)}
        contentContainerStyle={{
          paddingTop: headerHeight || insets.top + appSpacing.defaultHeaderOffset,
          paddingBottom: insets.bottom + appSpacing.screenBottomOffset,
        }}
        showsVerticalScrollIndicator={false}
        {...props}
      >
        {children}
      </AnimatedScrollView>
    );
  }
);

ScreenScrollView.displayName = 'ScreenScrollView';
