import { Button, Dialog, FieldError, Input, Spinner } from 'heroui-native';
import { useEffect, useState } from 'react';
import { View, useWindowDimensions } from 'react-native';
import { useReanimatedKeyboardAnimation } from 'react-native-keyboard-controller';
import Animated, {
  Easing,
  FadeInDown,
  FadeOutDown,
  useAnimatedStyle,
  withTiming,
} from 'react-native-reanimated';

import { DialogBlurBackdrop } from '@/components/dialog-blur-backdrop';
import { useAppTheme } from '@/contexts/app-theme-context';

type RenameArtifactDialogProps = {
  initialName: string;
  isOpen: boolean;
  isRenaming: boolean;
  onOpenChange: (open: boolean) => void;
  onRename: (name: string) => Promise<void>;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Failed to rename artifact.';
}

function KeyboardAwareDialogContainer({ children }: { children: React.ReactNode }) {
  const { height } = useWindowDimensions();
  const { progress } = useReanimatedKeyboardAnimation();
  const keyboardOffset = Math.min(height * 0.1, 72);

  const rStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: withTiming(-keyboardOffset * progress.get(), {
            duration: 220,
          }),
        },
      ],
    };
  });

  return <Animated.View style={rStyle}>{children}</Animated.View>;
}

function RenameArtifactDialogForm({
  initialName,
  isOpen,
  isRenaming,
  onOpenChange,
  onRename,
}: RenameArtifactDialogProps) {
  const { isDark } = useAppTheme();
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setName(initialName);
      setError(null);
      return;
    }

    setName(initialName);
    setError(null);
  }, [initialName, isOpen]);

  const handleClose = () => {
    setName(initialName);
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || isRenaming) {
      return;
    }

    if (trimmedName === initialName.trim()) {
      handleClose();
      return;
    }

    setError(null);

    try {
      await onRename(trimmedName);
      handleClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  };

  return (
    <Dialog.Content
      className="bg-white px-6 pt-6 pb-5 dark:bg-[#1B1B1D]"
      animation={{
        entering: FadeInDown.duration(200).easing(Easing.out(Easing.ease)),
        exiting: FadeOutDown.duration(150).easing(Easing.in(Easing.ease)),
      }}
    >
      <View className="gap-6">
        <Dialog.Title className="text-[18px] font-bold leading-6 text-black dark:text-white">
          Rename Artifact
        </Dialog.Title>

        <View className="gap-2">
          <Input
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            className="h-14 rounded-[12px] border-0 bg-zinc-100 px-4 py-0 text-black shadow-none focus:border-0 dark:bg-[#39393D] dark:text-white dark:focus:border-0"
            isInvalid={false}
            onChangeText={(text) => {
              setName(text);
              if (error) {
                setError(null);
              }
            }}
            onSubmitEditing={() => {
              void handleSubmit();
            }}
            placeholder="Enter artifact name"
            placeholderColorClassName="text-zinc-500"
            returnKeyType="done"
            selectionColorClassName="accent-black dark:accent-white"
            textAlignVertical="center"
            value={name}
            variant="secondary"
          />
          {error ? <FieldError className="text-[12px]">{error}</FieldError> : null}
        </View>

        <View className="flex-row items-center justify-between gap-4">
          <Button isDisabled={isRenaming} onPress={handleClose} size="md" variant="ghost">
            <Button.Label
              className="text-[14px] text-black dark:text-white"
              maxFontSizeMultiplier={1.2}
            >
              Cancel
            </Button.Label>
          </Button>
          <Button
            className="rounded-[12px] bg-black px-4 dark:bg-[#FFFFFF]"
            isDisabled={!name.trim() || isRenaming || name.trim() === initialName.trim()}
            onPress={() => void handleSubmit()}
            size="md"
          >
            {isRenaming ? <Spinner color={isDark ? '#111111' : '#FFFFFF'} size="sm" /> : null}
            <Button.Label
              className="text-[14px] text-white dark:text-black"
              maxFontSizeMultiplier={1.2}
            >
              {isRenaming ? 'Saving' : 'Save'}
            </Button.Label>
          </Button>
        </View>
      </View>
    </Dialog.Content>
  );
}

export function RenameArtifactDialog({
  initialName,
  isOpen,
  isRenaming,
  onOpenChange,
  onRename,
}: RenameArtifactDialogProps) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal className="justify-center">
        <DialogBlurBackdrop />
        <KeyboardAwareDialogContainer>
          <RenameArtifactDialogForm
            initialName={initialName}
            isOpen={isOpen}
            isRenaming={isRenaming}
            onOpenChange={onOpenChange}
            onRename={onRename}
          />
        </KeyboardAwareDialogContainer>
      </Dialog.Portal>
    </Dialog>
  );
}
