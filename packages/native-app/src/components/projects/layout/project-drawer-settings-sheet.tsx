import Feather from '@expo/vector-icons/Feather';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BottomSheet, Button } from 'heroui-native';
import { type FC, useState } from 'react';
import { Pressable, View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { AppText } from '@/components/app-text';
import { ThemeToggle } from '@/components/theme-toggle';
import { useAppTheme } from '@/contexts/app-theme-context';
import { appSpacing } from '@/styles/ui';

const SETTINGS_LABEL = 'Sugar Baby';
const StyledFeather = withUniwind(Feather);

type SettingsRowProps = {
  icon: React.ComponentProps<typeof Feather>['name'];
  label: string;
  onPress?: () => void;
  showDivider?: boolean;
  trailing?: React.ReactNode;
  value?: string;
};

const SettingsRow: FC<SettingsRowProps> = ({
  icon,
  label,
  onPress,
  showDivider = true,
  trailing,
  value,
}) => {
  const content = (
    <View className="flex-row items-center gap-4 px-4 py-4">
      <StyledFeather className="text-foreground" name={icon} size={20} />
      <AppText className="flex-1 text-[15px] font-medium text-foreground">{label}</AppText>
      {value ? (
        <AppText className="text-[13px] text-foreground/55" numberOfLines={1}>
          {value}
        </AppText>
      ) : null}
      {trailing ?? <StyledFeather className="text-foreground/35" name="chevron-right" size={18} />}
    </View>
  );

  return (
    <View
      className={showDivider ? 'border-b border-foreground/10' : undefined}
      style={showDivider ? undefined : { borderBottomWidth: 0 }}
    >
      {onPress ? (
        <Pressable android_ripple={{ color: 'transparent' }} onPress={onPress}>
          {content}
        </Pressable>
      ) : (
        content
      )}
    </View>
  );
};

type ProjectDrawerSettingsSheetProps = {
  onHeightChange?: (height: number) => void;
};

export const ProjectDrawerSettingsSheet: FC<ProjectDrawerSettingsSheetProps> = ({
  onHeightChange,
}) => {
  const insets = useSafeAreaInsets();
  const { toggleTheme } = useAppTheme();
  const [isOpen, setIsOpen] = useState(false);

  const handleLayout = (event: LayoutChangeEvent) => {
    onHeightChange?.(event.nativeEvent.layout.height);
  };

  return (
    <BottomSheet isOpen={isOpen} onOpenChange={setIsOpen}>
      <View
        className="absolute inset-x-0 bottom-0 bg-background"
        onLayout={handleLayout}
        pointerEvents="box-none"
        style={{
          paddingTop: 4,
          paddingBottom: insets.bottom,
        }}
      >
        <BottomSheet.Trigger asChild>
          <Button
            accessibilityLabel="Open settings"
            className="h-auto min-h-0 w-full justify-start gap-4 rounded-none px-4 pt-3 pb-2"
            variant="ghost"
          >
            <View className="size-10 items-center justify-center rounded-full bg-foreground/15">
              <AppText className="text-[14px] font-medium text-foreground/80">SU</AppText>
            </View>
            <Button.Label className="text-[18px] font-medium text-foreground">
              {SETTINGS_LABEL}
            </Button.Label>
          </Button>
        </BottomSheet.Trigger>
      </View>

      <BottomSheet.Portal>
        <BottomSheet.Overlay />
        <BottomSheet.Content
          backgroundClassName="rounded-t-[32px] bg-[#F2F2F7] dark:bg-[#1C1C1E]"
          contentContainerClassName="px-5 pt-4"
          handleIndicatorClassName="bg-foreground/20"
        >
          <BottomSheetScrollView
            contentContainerStyle={{
              gap: appSpacing.lg,
              paddingBottom: insets.bottom + appSpacing.lg,
            }}
            showsVerticalScrollIndicator={false}
          >
            <View className="relative items-center pb-1">
              <BottomSheet.Title className="text-[20px] font-semibold text-foreground">
                Settings
              </BottomSheet.Title>
              <Button
                accessibilityLabel="Close settings"
                className="absolute right-0 top-[-6px] rounded-full border border-foreground/10"
                isIconOnly
                size="sm"
                variant="ghost"
                onPress={() => setIsOpen(false)}
              >
                <StyledFeather className="text-foreground" name="x" size={18} />
              </Button>
            </View>

            <View className="gap-4">
              <AppText className="px-1 text-[15px] font-semibold text-foreground/65">
                Account
              </AppText>
              <View className="overflow-hidden rounded-[28px] bg-default">
                <SettingsRow icon="mail" label="Email" value="thatsugarkid@gmail.com" />
                <SettingsRow icon="plus-circle" label="Subscription" value="Pro" />
                <SettingsRow icon="refresh-cw" label="Restore purchases" showDivider={false} />
              </View>
            </View>

            <View className="gap-4">
              <AppText className="px-1 text-[15px] font-semibold text-foreground/65">App</AppText>
              <View className="overflow-hidden rounded-[28px] bg-default">
                <SettingsRow icon="bell" label="Notifications" />
                <SettingsRow icon="grid" label="Apps" />
                <SettingsRow
                  icon="moon"
                  label="Theme"
                  onPress={toggleTheme}
                  showDivider={false}
                  trailing={
                    <View className="mr-[-6px]" pointerEvents="none">
                      <ThemeToggle interactive={false} />
                    </View>
                  }
                />
              </View>
            </View>
          </BottomSheetScrollView>
        </BottomSheet.Content>
      </BottomSheet.Portal>
    </BottomSheet>
  );
};
