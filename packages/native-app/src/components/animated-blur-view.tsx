import { BlurView, type BlurViewProps } from 'expo-blur';
import Animated, { type SharedValue, useAnimatedProps } from 'react-native-reanimated';

import type { FC } from 'react';

const RBlurView = Animated.createAnimatedComponent(BlurView);

interface Props extends BlurViewProps {
  blurIntensity: SharedValue<number>;
}

export const AnimatedBlurView: FC<Props> = ({ blurIntensity, ...props }) => {
  const animatedProps = useAnimatedProps(() => {
    return {
      intensity: blurIntensity.get(),
    };
  });

  return <RBlurView animatedProps={animatedProps} {...props} />;
};
