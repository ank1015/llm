import { Link, useLocalSearchParams } from 'expo-router';
import { Menu, Skeleton, Spinner, Tabs, useThemeColor, useToast } from 'heroui-native';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  RefreshControl,
  View,
  useWindowDimensions,
  type ScrollView,
} from 'react-native';

import { AppText } from '@/components/app-text';
import { PlusIcon } from '@/components/icons/plus';
import { ProjectArtifactExplorer } from '@/components/projects/artifacts/project-artifact-explorer';
import { ProjectPromptComposer } from '@/components/projects/composer/project-prompt-composer';
import { useProjectShell } from '@/components/projects/layout/project-shell-context';
import { SkillIcon } from '@/components/projects/skills/skill-icons';
import { ScreenScrollView } from '@/components/screen-scroll-view';
import {
  installArtifactSkill,
  listBundledSkills,
  listInstalledArtifactSkills,
  type BundledSkillDto,
} from '@/lib/client-api';
import { useSidebarStore } from '@/stores';
import { appLayout, appSpacing, appTabsStyles, appTypography } from '@/styles/ui';

const CHAT_SKELETON_WIDTHS = ['w-[88%]', 'w-[76%]', 'w-[82%]', 'w-[68%]'] as const;

function ArtifactChatSkeletonRow({ index }: { index: number }) {
  return (
    <View className={appLayout.artifactChatRow}>
      <Skeleton
        className={`h-8 rounded-md ${CHAT_SKELETON_WIDTHS[index % CHAT_SKELETON_WIDTHS.length]}`}
      />
    </View>
  );
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return 'Something went wrong.';
}

export function ProjectArtifactScreen() {
  const params = useLocalSearchParams<{ artifactId?: string | string[] }>();
  const artifactId = Array.isArray(params.artifactId) ? params.artifactId[0] : params.artifactId;
  const { projectId, refreshOverview } = useProjectShell();
  const { toast } = useToast();
  const artifact = useSidebarStore(
    (state) => state.artifactDirs.find((entry) => entry.id === artifactId) ?? null
  );
  const isLoading = useSidebarStore((state) => state.isLoading);
  const isRefreshing = useSidebarStore((state) => state.isRefreshing);
  const error = useSidebarStore((state) => state.error);
  const [activeTab, setActiveTab] = useState('chats');
  const [composerHeight, setComposerHeight] = useState(0);
  const [isSkillsMenuOpen, setIsSkillsMenuOpen] = useState(false);
  const [bundledSkills, setBundledSkills] = useState<BundledSkillDto[]>([]);
  const [installedSkillNames, setInstalledSkillNames] = useState<Set<string>>(new Set());
  const [isSkillsLoading, setIsSkillsLoading] = useState(false);
  const [skillsError, setSkillsError] = useState<string | null>(null);
  const [installingSkillName, setInstallingSkillName] = useState<string | null>(null);
  const scrollRef = useRef<ScrollView>(null);
  const wasRefreshingRef = useRef(false);
  const { height: windowHeight } = useWindowDimensions();
  const [foregroundColor, mutedColor] = useThemeColor(['foreground', 'muted']);
  const composerInset = activeTab === 'chats' ? composerHeight + appSpacing.sm : 0;
  const endSpacerHeight = Math.round(windowHeight * 0.4);
  const shouldShowChatSkeletons = !artifact && !error && (isLoading || isRefreshing);

  useEffect(() => {
    if (wasRefreshingRef.current && !isRefreshing) {
      requestAnimationFrame(() => {
        scrollRef.current?.scrollTo({
          animated: false,
          y: 0,
        });
      });
    }

    wasRefreshingRef.current = isRefreshing;
  }, [isRefreshing]);

  useEffect(() => {
    setIsSkillsMenuOpen(false);
    setBundledSkills([]);
    setInstalledSkillNames(new Set());
    setIsSkillsLoading(false);
    setSkillsError(null);
    setInstallingSkillName(null);
  }, [artifactId, projectId]);

  const sessions = useMemo(() => {
    if (!artifact) {
      return [];
    }

    return [...artifact.sessions].sort((left, right) => {
      const leftTimestamp = Date.parse(left.updatedAt ?? left.createdAt);
      const rightTimestamp = Date.parse(right.updatedAt ?? right.createdAt);

      return rightTimestamp - leftTimestamp;
    });
  }, [artifact]);

  const installableSkills = useMemo(
    () => bundledSkills.filter((skill) => !installedSkillNames.has(skill.name)),
    [bundledSkills, installedSkillNames]
  );

  const loadSkills = async (): Promise<void> => {
    if (!artifactId) {
      return;
    }

    setIsSkillsLoading(true);
    setSkillsError(null);

    try {
      const [bundled, installed] = await Promise.all([
        listBundledSkills(),
        listInstalledArtifactSkills({ projectId, artifactId }),
      ]);

      setBundledSkills(bundled);
      setInstalledSkillNames(new Set(installed.map((skill) => skill.name)));
    } catch (skillError) {
      const message = getErrorMessage(skillError);
      setSkillsError(message);
      toast.show({
        variant: 'danger',
        label: 'Could not load skills',
        description: message,
      });
    } finally {
      setIsSkillsLoading(false);
    }
  };

  const handleSkillsMenuOpenChange = (open: boolean) => {
    setIsSkillsMenuOpen(open);
    if (open) {
      void loadSkills();
    }
  };

  const handleInstallSkill = async (skillName: string) => {
    if (!artifactId || installingSkillName) {
      return;
    }

    setInstallingSkillName(skillName);

    try {
      const installedSkill = await installArtifactSkill(
        { projectId, artifactId },
        {
          skillName,
        }
      );

      setInstalledSkillNames((current) => {
        const next = new Set(current);
        next.add(installedSkill.name);
        return next;
      });
      setIsSkillsMenuOpen(false);
      toast.show({
        label: 'Skill installed',
        description: `${installedSkill.name} is now available in this artifact.`,
      });
    } catch (installError) {
      toast.show({
        variant: 'danger',
        label: 'Install failed',
        description: getErrorMessage(installError),
      });
    } finally {
      setInstallingSkillName(null);
    }
  };

  return (
    <View className="flex-1 bg-background">
      <Tabs className="flex-1" onValueChange={setActiveTab} value={activeTab} variant="primary">
        <View className="px-5" style={{ paddingTop: appSpacing.lg, paddingBottom: appSpacing.sm }}>
          {/* Artifact header intentionally remains commented out for now. */}
          <View className={appLayout.artifactTabsSection}>
            <View className="flex-row items-center justify-between gap-3">
              <Tabs.List className={appTabsStyles.artifactList}>
                <Tabs.Indicator className={appTabsStyles.artifactIndicator} />
                <Tabs.Trigger className={appTabsStyles.artifactTrigger} value="chats">
                  {({ isSelected }) => (
                    <Tabs.Label
                      className={
                        isSelected
                          ? appTypography.artifactTabActiveLabel
                          : appTypography.artifactTabInactiveLabel
                      }
                    >
                      Chats
                    </Tabs.Label>
                  )}
                </Tabs.Trigger>
                <Tabs.Trigger className={appTabsStyles.artifactTrigger} value="artifacts">
                  {({ isSelected }) => (
                    <Tabs.Label
                      className={
                        isSelected
                          ? appTypography.artifactTabActiveLabel
                          : appTypography.artifactTabInactiveLabel
                      }
                    >
                      Artifacts
                    </Tabs.Label>
                  )}
                </Tabs.Trigger>
              </Tabs.List>

              <Menu isOpen={isSkillsMenuOpen} onOpenChange={handleSkillsMenuOpenChange}>
                <Menu.Trigger asChild>
                  <Pressable
                    accessibilityLabel="Add skill"
                    android_ripple={{ color: 'transparent' }}
                    className="size-10 items-center justify-center rounded-full"
                    style={{ borderCurve: 'continuous' }}
                  >
                    {installingSkillName ? (
                      <Spinner size="sm" />
                    ) : (
                      <PlusIcon color={foregroundColor} size={18} />
                    )}
                  </Pressable>
                </Menu.Trigger>

                <Menu.Portal>
                  <Menu.Overlay />
                  <Menu.Content
                    align="end"
                    className="bg-default"
                    offset={10}
                    placement="bottom"
                    presentation="popover"
                    width={260}
                  >
                    <Menu.Label className="px-3 pb-2 pt-1 text-sm font-semibold text-muted">
                      Skills
                    </Menu.Label>

                    {isSkillsLoading ? (
                      <View className="px-3 pb-2">
                        <Menu.Item isDisabled>
                          <Spinner size="sm" />
                          <Menu.ItemTitle className="text-[15px] text-foreground">
                            Loading skills...
                          </Menu.ItemTitle>
                        </Menu.Item>
                      </View>
                    ) : skillsError ? (
                      <View className="px-3 pb-2">
                        <Menu.Item isDisabled>
                          <Menu.ItemTitle className="text-[15px] text-danger">
                            {skillsError}
                          </Menu.ItemTitle>
                        </Menu.Item>
                      </View>
                    ) : installableSkills.length === 0 ? (
                      <View className="px-3 pb-2">
                        <Menu.Item isDisabled>
                          <Menu.ItemTitle className="text-[15px] text-muted">
                            All skills installed
                          </Menu.ItemTitle>
                        </Menu.Item>
                      </View>
                    ) : (
                      <View className="px-2 pb-2">
                        {installableSkills.map((skill) => (
                          <Menu.Item
                            key={skill.name}
                            id={skill.name}
                            isDisabled={Boolean(installingSkillName)}
                            shouldCloseOnSelect={false}
                            onPress={() => {
                              void handleInstallSkill(skill.name);
                            }}
                          >
                            <SkillIcon color={foregroundColor} skillName={skill.name} size={18} />
                            <Menu.ItemTitle className="text-[15px] text-foreground">
                              {skill.name}
                            </Menu.ItemTitle>
                          </Menu.Item>
                        ))}
                      </View>
                    )}
                  </Menu.Content>
                </Menu.Portal>
              </Menu>
            </View>
          </View>
        </View>

        <Tabs.Content className="flex-1" value="chats">
          <View className="flex-1" style={{ paddingBottom: composerInset }}>
            <ScreenScrollView
              ref={scrollRef}
              alwaysBounceVertical
              className="flex-1"
              contentContainerClassName={appLayout.artifactScreen}
              contentContainerStyle={{
                paddingTop: appSpacing.sm,
                paddingBottom: appSpacing.lg,
              }}
              contentInsetAdjustmentBehavior="never"
              keyboardShouldPersistTaps="handled"
              refreshControl={
                <RefreshControl
                  colors={[mutedColor]}
                  onRefresh={() => {
                    void refreshOverview('refresh');
                  }}
                  refreshing={isRefreshing}
                  tintColor={mutedColor}
                />
              }
            >
              <View className={appLayout.artifactChatList}>
                {error && !artifact ? (
                  <AppText className={appTypography.body}>{error}</AppText>
                ) : null}

                {shouldShowChatSkeletons
                  ? Array.from({ length: 4 }, (_, index) => (
                      <ArtifactChatSkeletonRow
                        key={`artifact-chat-skeleton-${index}`}
                        index={index}
                      />
                    ))
                  : null}

                {!shouldShowChatSkeletons && !isLoading && !error && !artifact ? (
                  <AppText className={appTypography.bodyMuted}>Artifact not found.</AppText>
                ) : null}

                {!shouldShowChatSkeletons && artifact && sessions.length === 0 ? (
                  <AppText className={appTypography.bodyMuted}>No chats yet.</AppText>
                ) : null}

                {!shouldShowChatSkeletons && artifact
                  ? sessions.map((session) => (
                      <Link
                        key={session.sessionId}
                        asChild
                        href={{
                          pathname: '/[projectId]/[artifactId]/[threadId]',
                          params: {
                            projectId,
                            artifactId: artifact.id,
                            threadId: session.sessionId,
                          },
                        }}
                      >
                        <Pressable
                          android_ripple={{ color: 'transparent' }}
                          pressRetentionOffset={{ bottom: 12, left: 0, right: 0, top: 12 }}
                          style={{ borderCurve: 'continuous' }}
                        >
                          <View className={appLayout.artifactChatRow}>
                            <AppText className={appTypography.artifactChatTitle} numberOfLines={1}>
                              {session.sessionName}
                            </AppText>
                          </View>
                        </Pressable>
                      </Link>
                    ))
                  : null}

                <View pointerEvents="none" style={{ height: endSpacerHeight }} />
              </View>
            </ScreenScrollView>
          </View>
        </Tabs.Content>

        <Tabs.Content className="flex-1" value="artifacts">
          <ProjectArtifactExplorer artifactId={artifactId ?? ''} projectId={projectId} />
        </Tabs.Content>
      </Tabs>

      <ProjectPromptComposer
        artifactId={artifactId ?? ''}
        onHeightChange={setComposerHeight}
        projectId={projectId}
        visible={activeTab === 'chats'}
      />
    </View>
  );
}
