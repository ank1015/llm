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

type CreateProjectDialogProps = {
  isCreating: boolean;
  isOpen: boolean;
  onCreate: (name: string) => Promise<void>;
  onOpenChange: (open: boolean) => void;
};

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return 'Failed to create project.';
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

function CreateProjectDialogForm({
  isCreating,
  isOpen,
  onCreate,
  onOpenChange,
}: CreateProjectDialogProps) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setName('');
      setError(null);
    }
  }, [isOpen]);

  const handleClose = () => {
    setName('');
    setError(null);
    onOpenChange(false);
  };

  const handleSubmit = async () => {
    const trimmedName = name.trim();
    if (trimmedName.length === 0 || isCreating) {
      return;
    }

    setError(null);

    try {
      await onCreate(trimmedName);
      handleClose();
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    }
  };

  return (
    <Dialog.Content
      className="bg-surface px-6 pt-6 pb-5"
      animation={{
        entering: FadeInDown.duration(200).easing(Easing.out(Easing.ease)),
        exiting: FadeOutDown.duration(150).easing(Easing.in(Easing.ease)),
      }}
    >
      <View className="gap-6">
        <Dialog.Title className="text-[18px] font-bold leading-6">Create Project</Dialog.Title>

        <View className="gap-2">
          <Input
            autoCapitalize="words"
            autoCorrect={false}
            autoFocus
            variant='primary'
            isInvalid={false}
            className='rounded-lg'
            onChangeText={(text) => {
              setName(text);
              if (error) {
                setError(null);
              }
            }}
            onSubmitEditing={() => {
              void handleSubmit();
            }}
            placeholder="Enter project name"
            returnKeyType="done"
            value={name}
          />
          {error ? <FieldError className="text-[12px]">{error}</FieldError> : null}
        </View>

        <View className="flex-row items-center justify-between gap-4">
          <Button variant="ghost" size="md" isDisabled={isCreating} onPress={handleClose}>
            <Button.Label className="text-[14px]" maxFontSizeMultiplier={1.2}>
              Cancel
            </Button.Label>
          </Button>
          <Button
            className="rounded-lg px-4"
            size="md"
            isDisabled={!name.trim() || isCreating}
            onPress={() => void handleSubmit()}
          >
            {isCreating ? <Spinner size="sm" /> : null}
            <Button.Label className="text-[14px]" maxFontSizeMultiplier={1.2}>
              {isCreating ? 'Creating' : 'Create Project'}
            </Button.Label>
          </Button>
        </View>
      </View>
    </Dialog.Content>
  );
}

export function CreateProjectDialog({
  isCreating,
  isOpen,
  onCreate,
  onOpenChange,
}: CreateProjectDialogProps) {
  return (
    <Dialog isOpen={isOpen} onOpenChange={onOpenChange}>
      <Dialog.Portal className="justify-center">
        <DialogBlurBackdrop />
        <KeyboardAwareDialogContainer>
          <CreateProjectDialogForm
            isCreating={isCreating}
            isOpen={isOpen}
            onCreate={onCreate}
            onOpenChange={onOpenChange}
          />
        </KeyboardAwareDialogContainer>
      </Dialog.Portal>
    </Dialog>
  );
}
