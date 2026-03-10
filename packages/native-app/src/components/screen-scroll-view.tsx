import { useHeaderHeight } from '@react-navigation/elements';
import { cn } from 'heroui-native';
import { ScrollView, type ScrollViewProps } from 'react-native';
import Animated, { type AnimatedProps } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { FC, PropsWithChildren } from 'react';

import { appColors, appLayout, appSpacing } from '@/styles/ui';

const AnimatedScrollView = Animated.createAnimatedComponent(ScrollView);

interface Props extends AnimatedProps<ScrollViewProps> {
  className?: string;
  contentContainerClassName?: string;
}

export const ScreenScrollView: FC<PropsWithChildren<Props>> = ({
  children,
  className,
  contentContainerClassName,
  ...props
}) => {
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  return (
    <AnimatedScrollView
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
};
