import Feather from '@expo/vector-icons/Feather';
import { useThemeColor } from 'heroui-native';
import { Pressable, TextInput, View } from 'react-native';
import { withUniwind } from 'uniwind';

import { ProjectPromptPicker } from './project-prompt-picker';

import type { RefObject } from 'react';
import type {
  NativeSyntheticEvent,
  TextInputKeyPressEventData,
  TextInputSelectionChangeEventData,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { appInputStyles, appLayout, appSizes, appTypography } from '@/styles/ui';

const StyledFeather = withUniwind(Feather);
const StyledTextInput = withUniwind(TextInput);

type PickerOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type ProjectPromptInputShellProps = {
  inputRef: RefObject<TextInput | null>;
  isEditing: boolean;
  isStreaming: boolean;
  isSubmitDisabled: boolean;
  modelLabel: string;
  modelOptions: readonly PickerOption[];
  modelValue: string;
  onCancelEdit: () => void;
  onChangeText: (value: string) => void;
  onKeyPress: (event: NativeSyntheticEvent<TextInputKeyPressEventData>) => void;
  onModelChange: (value: string) => void;
  onSelectionChange: (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
  onStop: () => void;
  onSubmit: () => void;
  onThinkingChange: (value: string) => void;
  placeholder: string;
  selection?: {
    start: number;
    end: number;
  };
  thinkingLabel: string;
  thinkingOptions: readonly PickerOption[];
  thinkingValue: string;
  value: string;
};

export function ProjectPromptInputShell({
  inputRef,
  isEditing,
  isStreaming,
  isSubmitDisabled,
  modelLabel,
  modelOptions,
  modelValue,
  onCancelEdit,
  onChangeText,
  onKeyPress,
  onModelChange,
  onSelectionChange,
  onStop,
  onSubmit,
  onThinkingChange,
  placeholder,
  selection,
  thinkingLabel,
  thinkingOptions,
  thinkingValue,
  value,
}: ProjectPromptInputShellProps) {
  const [foregroundColor, mutedColor, accentColor] = useThemeColor([
    'foreground',
    'muted',
    'accent',
  ]);
  const handlePickerPress = () => {
    inputRef.current?.blur();
  };

  return (
    <View
      className={appLayout.composerSurface}
      style={{
        borderCurve: 'continuous',
        boxShadow: '0 14px 40px rgba(15, 23, 42, 0.08)',
      }}
    >
      {isEditing ? (
        <View className={appLayout.composerEditRow}>
          <AppText className={appTypography.composerEditLabel}>Editing earlier message</AppText>
          <Pressable
            accessibilityLabel="Cancel editing"
            android_ripple={{ color: 'transparent' }}
            style={{ borderCurve: 'continuous' }}
            onPress={onCancelEdit}
          >
            <AppText className={appTypography.composerEditAction}>Cancel</AppText>
          </Pressable>
        </View>
      ) : null}

      <View className={appLayout.composerInputRegion}>
        <StyledTextInput
          ref={inputRef}
          autoCapitalize="sentences"
          autoCorrect
          blurOnSubmit={false}
          className={appInputStyles.composerField}
          cursorColor={accentColor}
          multiline
          onChangeText={onChangeText}
          onKeyPress={onKeyPress}
          onSelectionChange={onSelectionChange}
          placeholder={placeholder}
          placeholderTextColor={mutedColor}
          selectionColor={accentColor}
          {...(selection ? { selection } : {})}
          style={{
            color: foregroundColor,
            maxHeight: appSizes.composerInputMaxHeight,
            paddingVertical: 8,
            textAlignVertical: 'top',
          }}
          value={value}
        />
      </View>

      <View className={appLayout.composerFooter}>
        <View className={appLayout.composerFooterActions}>
          <Pressable
            accessibilityLabel="Composer actions"
            android_ripple={{ color: 'transparent' }}
            className={appLayout.composerIconButton}
            style={{ borderCurve: 'continuous' }}
            onPress={() => {
              inputRef.current?.focus();
            }}
          >
            <StyledFeather className="text-foreground" name="plus" size={appSizes.iconSm} />
          </Pressable>

          <ProjectPromptPicker
            label="Select model"
            onTriggerPress={handlePickerPress}
            onValueChange={onModelChange}
            options={modelOptions}
            value={modelValue}
            valueLabel={modelLabel}
          />

          <ProjectPromptPicker
            label="Select reasoning level"
            onTriggerPress={handlePickerPress}
            onValueChange={onThinkingChange}
            options={thinkingOptions}
            value={thinkingValue}
            valueLabel={thinkingLabel}
          />
        </View>

        <Pressable
          accessibilityLabel={isStreaming ? 'Stop generation' : 'Send message'}
          accessibilityRole="button"
          android_ripple={{ color: 'transparent' }}
          className={appLayout.composerSendButton}
          disabled={!isStreaming && isSubmitDisabled}
          style={{
            borderCurve: 'continuous',
            opacity: !isStreaming && isSubmitDisabled ? 0.45 : 1,
          }}
          onPress={isStreaming ? onStop : onSubmit}
        >
          <StyledFeather
            className="text-background"
            name={isStreaming ? 'square' : 'arrow-up'}
            size={isStreaming ? appSizes.iconXs : appSizes.iconSm}
          />
        </Pressable>
      </View>
    </View>
  );
}
