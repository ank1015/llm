import { Card, Skeleton } from 'heroui-native';
import { Image, Pressable, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import type { ProjectDto } from '@/lib/client-api';

export type ProjectCardProps = {
  index: number;
  onContextMenuPress?: () => void;
  onDeletePress?: () => void;
  onOpenPress: () => void;
  onRenamePress?: () => void;
  project: ProjectDto;
};

type ProjectCardTriggerProps = {
  index: number;
  onLongPress?: () => void;
  onOpenPress: () => void;
  project: ProjectDto;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const StyledImage = withUniwind(Image);
const mockProjectImages = [
  'https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/docs/avocado.jpeg',
  'https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/docs/oranges.jpeg',
  'https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/docs/demo1.jpg',
];

function getCardEntering(index: number) {
  return FadeInDown.duration(260)
    .delay(index * 60)
    .easing(Easing.out(Easing.ease));
}

function formatProjectMeta(createdAt: string): string {
  const date = new Date(createdAt);

  if (Number.isNaN(date.getTime())) {
    return 'Created recently';
  }

  return date.toLocaleDateString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function getProjectDescription(project: ProjectDto): string {
  if (project.description?.trim().length) {
    return project.description;
  }

  return formatProjectMeta(project.createdAt);
}

export function ProjectCardTrigger({
  index,
  onLongPress,
  onOpenPress,
  project,
}: ProjectCardTriggerProps) {
  const mockImageUri = mockProjectImages[index % mockProjectImages.length];
  const projectImageUri =
    typeof project.projectImg === 'string' && project.projectImg.trim().length > 0
      ? project.projectImg
      : mockImageUri;

  return (
    <AnimatedPressable
      entering={getCardEntering(index)}
      delayLongPress={250}
      onLongPress={onLongPress}
      onPress={onOpenPress}
    >
      <Card className="w-full flex-row items-start gap-4 p-4" variant="tertiary">
        <StyledImage
          source={{ uri: projectImageUri }}
          className="h-24 w-24 rounded-2xl"
          resizeMode="cover"
        />
        <View className="flex-1 items-start justify-start gap-2 pt-0">
          <Card.Body className="p-0">
            <Card.Title maxFontSizeMultiplier={1.2} numberOfLines={1}>
              {project.name}
            </Card.Title>
            <Card.Description numberOfLines={1} className="text-sm" maxFontSizeMultiplier={1.2}>
              {getProjectDescription(project)}
            </Card.Description>
          </Card.Body>
        </View>
      </Card>
    </AnimatedPressable>
  );
}

export function ProjectCardSkeleton({ index }: { index: number }) {
  return (
    <Animated.View entering={getCardEntering(index)}>
      <Card className="w-full flex-row items-start gap-4 p-4" variant="tertiary">
        <Skeleton className="h-24 w-24 rounded-2xl" />
        <View className="flex-1 items-start justify-start gap-3 py-1">
          <Skeleton className="h-5 w-2/3 rounded-md" />
          <Skeleton className="h-4 w-full rounded-md" />
          <Skeleton className="h-4 w-1/2 rounded-md" />
        </View>
      </Card>
    </Animated.View>
  );
}
