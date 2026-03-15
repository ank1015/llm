import Feather from '@expo/vector-icons/Feather';
import { Pressable, type PressableProps } from 'react-native';
import { withUniwind } from 'uniwind';

import type { ComponentProps } from 'react';

const StyledFeather = withUniwind(Feather);

type ThreadActionButtonProps = Omit<PressableProps, 'children'> & {
  accessibilityLabel: string;
  icon: ComponentProps<typeof Feather>['name'];
};

export function ThreadActionButton({
  accessibilityLabel,
  disabled,
  icon,
  ...props
}: ThreadActionButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      accessibilityRole="button"
      android_ripple={{ color: 'transparent' }}
      disabled={disabled}
      hitSlop={10}
      style={{ borderCurve: 'continuous', opacity: disabled ? 0.4 : 1, padding: 6 }}
      {...props}
    >
      <StyledFeather className="text-foreground/70" name={icon} size={16} />
    </Pressable>
  );
}
