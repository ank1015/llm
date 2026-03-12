import Feather from '@expo/vector-icons/Feather';
import { useGlobalSearchParams, useRouter } from 'expo-router';
import { type FC, useMemo } from 'react';
import { Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { withUniwind } from 'uniwind';

import { AppText } from '@/components/app-text';
import { cn } from '@/lib/utils';
import { useSidebarStore } from '@/stores';
import { appColors, appSizes } from '@/styles/ui';

const StyledFeather = withUniwind(Feather);

type BreadcrumbItem = {
  href:
    | {
        pathname: '/[projectId]';
        params: { projectId: string };
      }
    | {
        pathname: '/[projectId]/[artifactId]';
        params: { projectId: string; artifactId: string };
      }
    | {
        pathname: '/[projectId]/[artifactId]/[threadId]';
        params: { projectId: string; artifactId: string; threadId: string };
      };
  id: string;
  label: string;
};

function getCrumbMaxWidth(
  availableWidth: number,
  itemCount: number,
  isCurrent: boolean
): number | undefined {
  if (availableWidth <= 0) {
    return undefined;
  }

  if (itemCount === 1) {
    return availableWidth * 0.92;
  }

  if (itemCount === 2) {
    return availableWidth * (isCurrent ? 0.58 : 0.34);
  }

  return availableWidth * (isCurrent ? 0.42 : 0.24);
}

export const ProjectScreenHeader: FC = () => {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useGlobalSearchParams<{
    artifactId?: string | string[];
    projectId?: string | string[];
    threadId?: string | string[];
  }>();
  const projectName = useSidebarStore((state) => state.projectName);
  const artifactDirs = useSidebarStore((state) => state.artifactDirs);
  const projectId = Array.isArray(params.projectId) ? params.projectId[0] : params.projectId;
  const artifactId = Array.isArray(params.artifactId) ? params.artifactId[0] : params.artifactId;
  const threadId = Array.isArray(params.threadId) ? params.threadId[0] : params.threadId;
  const artifact = artifactDirs.find((entry) => entry.id === artifactId) ?? null;
  const thread = artifact?.sessions.find((entry) => entry.sessionId === threadId) ?? null;
  const breadcrumbItems = useMemo(() => {
    if (!projectId) {
      return [] as BreadcrumbItem[];
    }

    const items: BreadcrumbItem[] = [
      {
        href: {
          pathname: '/[projectId]',
          params: { projectId },
        },
        id: 'project',
        label: projectName ?? 'Project',
      },
    ];

    if (artifactId) {
      items.push({
        href: {
          pathname: '/[projectId]/[artifactId]',
          params: {
            projectId,
            artifactId,
          },
        },
        id: 'artifact',
        label: artifact?.name ?? 'Artifact',
      });
    }

    if (artifactId && threadId) {
      items.push({
        href: {
          pathname: '/[projectId]/[artifactId]/[threadId]',
          params: {
            projectId,
            artifactId,
            threadId,
          },
        },
        id: 'thread',
        label: thread?.sessionName ?? 'Thread',
      });
    }

    return items;
  }, [artifact?.name, artifactId, projectId, projectName, thread?.sessionName, threadId]);

  if (!projectId || breadcrumbItems.length === 0) {
    return null;
  }

  const breadcrumbAvailableWidth = Math.max(width - 40, 180);

  return (
    <View
      className="bg-background px-5"
      style={{
        paddingTop: insets.top + 10,
        paddingBottom: 8,
      }}
    >
      <View className="flex-row items-center overflow-hidden">
        {breadcrumbItems.map((item, index) => {
          const isCurrent = index === breadcrumbItems.length - 1;

          return (
            <View key={item.id} className="flex-row items-center">
              <Pressable
                android_ripple={{ color: 'transparent' }}
                disabled={isCurrent}
                hitSlop={6}
                style={{ borderCurve: 'continuous' }}
                onPress={() => router.replace(item.href)}
              >
                <AppText
                  className={cn(
                    'mx-1 text-[15px]',
                    isCurrent ? 'font-medium text-foreground' : 'text-muted'
                  )}
                  ellipsizeMode="tail"
                  numberOfLines={1}
                  style={{
                    flexShrink: 1,
                    maxWidth: getCrumbMaxWidth(
                      breadcrumbAvailableWidth,
                      breadcrumbItems.length,
                      isCurrent
                    ),
                  }}
                >
                  {item.label}
                </AppText>
              </Pressable>

              <StyledFeather
                className={appColors.foregroundSoft}
                name="chevron-right"
                size={appSizes.iconXs}
              />
            </View>
          );
        })}
      </View>
    </View>
  );
};
