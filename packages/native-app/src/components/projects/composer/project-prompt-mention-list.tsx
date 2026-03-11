import Feather from '@expo/vector-icons/Feather';
import { Pressable, View } from 'react-native';
import { withUniwind } from 'uniwind';

import { buildFileLabel, getIndexedEntryDisplayName } from './project-prompt-composer-utils';

import type { ProjectFileIndexEntry } from '@/lib/client-api';

import { AppText } from '@/components/app-text';
import { appColors, appLayout, appSizes, appTypography } from '@/styles/ui';


const StyledFeather = withUniwind(Feather);

type ProjectPromptMentionListProps = {
  error: string | null;
  isLoading: boolean;
  onSelect: (entry: ProjectFileIndexEntry) => void;
  results: ProjectFileIndexEntry[];
};

export function ProjectPromptMentionList({
  error,
  isLoading,
  onSelect,
  results,
}: ProjectPromptMentionListProps) {
  return (
    <View className={appLayout.composerMentionSurface} style={{ borderCurve: 'continuous' }}>
      {isLoading ? (
        <AppText className={appTypography.composerMentionEmpty}>Searching files…</AppText>
      ) : null}

      {!isLoading && error ? (
        <AppText className={appTypography.composerMentionError}>{error}</AppText>
      ) : null}

      {!isLoading && !error && results.length === 0 ? (
        <AppText className={appTypography.composerMentionEmpty}>No matching files.</AppText>
      ) : null}

      {!isLoading && !error && results.length > 0 ? (
        <View className={appLayout.composerMentionList}>
          {results.map((entry) => (
            <Pressable
              key={entry.artifactPath}
              android_ripple={{ color: 'transparent' }}
              style={{ borderCurve: 'continuous' }}
              onPress={() => onSelect(entry)}
            >
              <View className={appLayout.composerMentionRow}>
                <StyledFeather
                  className={appColors.foregroundMuted}
                  name={entry.type === 'directory' ? 'folder' : 'file'}
                  size={appSizes.iconSm}
                />
                <View className="flex-1">
                  <AppText className={appTypography.composerMentionTitle} numberOfLines={1}>
                    {getIndexedEntryDisplayName(entry)}
                  </AppText>
                  <AppText className={appTypography.composerMentionMeta} numberOfLines={1}>
                    {buildFileLabel(entry)}
                  </AppText>
                </View>
              </View>
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );
}
