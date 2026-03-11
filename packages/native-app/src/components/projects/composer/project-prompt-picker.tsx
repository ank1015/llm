import Feather from '@expo/vector-icons/Feather';
import { Menu, type MenuKey } from 'heroui-native';
import { useMemo } from 'react';
import { Pressable } from 'react-native';
import { withUniwind } from 'uniwind';

import { AppText } from '@/components/app-text';
import { appColors, appLayout, appSizes, appTypography } from '@/styles/ui';

const StyledFeather = withUniwind(Feather);

type PickerOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ProjectPromptPickerProps = {
  label: string;
  onValueChange: (value: string) => void;
  options: readonly PickerOption[];
  value: string;
  valueLabel: string;
};

export function ProjectPromptPicker({
  label,
  onValueChange,
  options,
  value,
  valueLabel,
}: ProjectPromptPickerProps) {
  const selectedKeys = useMemo(() => new Set<MenuKey>([value]), [value]);

  return (
    <Menu presentation="bottom-sheet">
      <Menu.Trigger asChild>
        <Pressable
          accessibilityLabel={label}
          android_ripple={{ color: 'transparent' }}
          className={appLayout.composerPickerTrigger}
          style={{ borderCurve: 'continuous' }}
        >
          <AppText className={appTypography.composerPickerLabel} numberOfLines={1}>
            {valueLabel}
          </AppText>
          <StyledFeather
            className={appColors.foregroundSoft}
            name="chevron-down"
            size={appSizes.iconXs}
          />
        </Pressable>
      </Menu.Trigger>

      <Menu.Portal>
        <Menu.Overlay />
        <Menu.Content
          backgroundClassName={appColors.background}
          contentContainerClassName={appLayout.composerMenuContent}
          handleIndicatorClassName="bg-foreground/20"
          presentation="bottom-sheet"
        >
          <Menu.Label className={appTypography.composerMenuLabel}>{label}</Menu.Label>
          <Menu.Group
            selectedKeys={selectedKeys}
            selectionMode="single"
            onSelectionChange={(keys) => {
              const nextValue = Array.from(keys)[0];
              if (typeof nextValue === 'string') {
                onValueChange(nextValue);
              }
            }}
          >
            {options.map((option) => (
              <Menu.Item key={option.value} id={option.value} isDisabled={option.disabled}>
                <Menu.ItemIndicator />
                <Menu.ItemTitle className={appTypography.composerMenuItemTitle}>
                  {option.label}
                </Menu.ItemTitle>
              </Menu.Item>
            ))}
          </Menu.Group>
        </Menu.Content>
      </Menu.Portal>
    </Menu>
  );
}
