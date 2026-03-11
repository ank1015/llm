import { useThemeColor } from 'heroui-native';
import { TextInput, View } from 'react-native';
import { withUniwind } from 'uniwind';

import type { RefObject } from 'react';
import type { NativeSyntheticEvent, TextInputSelectionChangeEventData } from 'react-native';

import { appInputStyles, appLayout, appSizes } from '@/styles/ui';

const StyledTextInput = withUniwind(TextInput);

type ProjectPromptInputShellProps = {
  inputRef: RefObject<TextInput | null>;
  onChangeText: (value: string) => void;
  onSelectionChange: (event: NativeSyntheticEvent<TextInputSelectionChangeEventData>) => void;
  placeholder: string;
  selection?: {
    start: number;
    end: number;
  };
  value: string;
};

export function ProjectPromptInputShell({
  inputRef,
  onChangeText,
  onSelectionChange,
  placeholder,
  selection,
  value,
}: ProjectPromptInputShellProps) {
  const [foregroundColor, mutedColor, accentColor] = useThemeColor([
    'foreground',
    'muted',
    'accent',
  ]);

  return (
    <View className={appLayout.composerSurface} style={{ borderCurve: 'continuous' }}>
      <StyledTextInput
        ref={inputRef}
        autoCapitalize="sentences"
        autoCorrect
        blurOnSubmit={false}
        className={appInputStyles.composerField}
        cursorColor={accentColor}
        multiline
        onChangeText={onChangeText}
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
  );
}
