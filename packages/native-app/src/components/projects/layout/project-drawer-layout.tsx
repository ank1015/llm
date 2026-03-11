import { Drawer } from 'expo-router/drawer';
import { useThemeColor } from 'heroui-native';
import { type FC, useCallback, useEffect, useMemo } from 'react';
import { View, useWindowDimensions } from 'react-native';

import { ProjectScreenHeader } from '@/components/projects/layout/project-header';
import {
  ProjectShellProvider,
  type ProjectOverviewRefreshMode,
} from '@/components/projects/layout/project-shell-context';
import { ProjectSidebarDrawer } from '@/components/projects/layout/project-sidebar-drawer';
import { useAppTheme } from '@/contexts/app-theme-context';
import { useSidebarStore } from '@/stores';

type ProjectDrawerLayoutProps = {
  projectId: string;
};

export const ProjectDrawerLayout: FC<ProjectDrawerLayoutProps> = ({ projectId }) => {
  const { width } = useWindowDimensions();
  const { isDark } = useAppTheme();
  const themeColorBackground = useThemeColor('background');
  const refreshSidebarOverview = useSidebarStore((state) => state.refreshOverview);
  const resetSidebar = useSidebarStore((state) => state.reset);

  const drawerWidth = Math.min(Math.max(width * 0.82, 280), 360);
  const drawerOverlayColor = isDark ? 'rgba(255, 255, 255, 0.08)' : 'rgba(0, 0, 0, 0.06)';

  const refreshOverview = useCallback(
    async (mode: ProjectOverviewRefreshMode = 'refresh') => {
      if (!projectId) {
        return;
      }

      await refreshSidebarOverview(projectId, { mode });
    },
    [projectId, refreshSidebarOverview]
  );

  useEffect(() => {
    void refreshOverview('initial');

    return () => {
      resetSidebar();
    };
  }, [refreshOverview, resetSidebar]);

  const providerValue = useMemo(
    () => ({
      projectId,
      refreshOverview,
    }),
    [projectId, refreshOverview]
  );

  return (
    <ProjectShellProvider value={providerValue}>
      <Drawer
        drawerContent={(props) => <ProjectSidebarDrawer {...props} />}
        screenLayout={({ children }) => (
          <View className="flex-1 bg-background">
            <ProjectScreenHeader />
            <View className="flex-1">{children}</View>
          </View>
        )}
        screenOptions={{
          headerShown: false,
          sceneStyle: {
            backgroundColor: themeColorBackground,
          },
          drawerStyle: {
            backgroundColor: themeColorBackground,
            width: drawerWidth,
          },
          drawerType: 'slide',
          overlayColor: drawerOverlayColor,
          swipeEdgeWidth: width,
          swipeMinDistance: 10,
        }}
      />
    </ProjectShellProvider>
  );
};
