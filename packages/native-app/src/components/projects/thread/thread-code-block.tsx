import * as Clipboard from 'expo-clipboard';
import { useToast } from 'heroui-native';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';


import { AppText } from '@/components/app-text';

type ThreadCodeBlockProps = {
  code: string;
  language?: string;
  compact?: boolean;
};

const MONOSPACE_STYLE = {
  fontFamily: process.env.EXPO_OS === 'ios' ? 'Menlo' : 'monospace',
};

export function ThreadCodeBlock({
  code,
  compact = false,
  language = 'plaintext',
}: ThreadCodeBlockProps) {
  const { toast } = useToast();
  const [copied, setCopied] = useState(false);
  const trimmedCode = code.replace(/\n$/, '');
  const displayLanguage = language === 'plaintext' ? '' : language;

  useEffect(() => {
    if (!copied) {
      return undefined;
    }

    const timeout = setTimeout(() => {
      setCopied(false);
    }, 1800);

    return () => {
      clearTimeout(timeout);
    };
  }, [copied]);

  const handleCopy = () => {
    void Clipboard.setStringAsync(trimmedCode).then(() => {
      setCopied(true);
      toast.show({
        variant: 'success',
        label: 'Copied',
        description: 'Code block copied to clipboard.',
      });
    });
  };

  return (
    <View
      className="overflow-hidden rounded-[20px] border border-foreground/10 bg-default"
      style={{ borderCurve: 'continuous' }}
    >
      <View className="flex-row items-center justify-between border-b border-foreground/10 px-4 py-2.5">
        <AppText className="text-[12px] font-medium uppercase tracking-[0.18em] text-muted">
          {displayLanguage || 'Code'}
        </AppText>
        <Pressable
          accessibilityLabel={copied ? 'Copied code' : 'Copy code'}
          android_ripple={{ color: 'transparent' }}
          style={{ borderCurve: 'continuous' }}
          onPress={handleCopy}
        >
          <AppText className="text-[12px] font-medium text-foreground">
            {copied ? 'Copied' : 'Copy'}
          </AppText>
        </Pressable>
      </View>

      <ScrollView
        horizontal
        contentContainerStyle={{ minWidth: '100%' }}
        showsHorizontalScrollIndicator={false}
      >
        <AppText
          selectable
          className={
            compact
              ? 'px-4 py-3 text-[12px] leading-5 text-foreground'
              : 'px-4 py-3.5 text-[13px] leading-6 text-foreground'
          }
          style={MONOSPACE_STYLE}
        >
          {trimmedCode}
        </AppText>
      </ScrollView>
    </View>
  );
}
