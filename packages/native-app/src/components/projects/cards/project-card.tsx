import { Card } from 'heroui-native';
import { Image, Pressable, View } from 'react-native';
import Animated, { Easing, FadeInDown } from 'react-native-reanimated';
import { withUniwind } from 'uniwind';

import type { ProjectMetadata } from '@/lib/client-api';

type ProjectCardProps = {
  index: number;
  onOpenPress: () => void;
  onLongPress?: () => void;
  project: ProjectMetadata;
};

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);
const StyledImage = withUniwind(Image);
const mockProjectImages = [
  'https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/docs/avocado.jpeg',
  'https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/docs/oranges.jpeg',
  'https://heroui-assets.nyc3.cdn.digitaloceanspaces.com/docs/demo1.jpg',
];

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

function getProjectDescription(project: ProjectMetadata): string {
  if (project.description?.trim().length) {
    return project.description;
  }

  return formatProjectMeta(project.createdAt);
}

export function ProjectCard({ index, onOpenPress, onLongPress, project }: ProjectCardProps) {
  const mockImageUri = mockProjectImages[index % mockProjectImages.length];
  const projectImageUri =
    typeof project.projectImg === 'string' && project.projectImg.trim().length > 0
      ? project.projectImg
      : mockImageUri;

  return (
    <AnimatedPressable
      entering={FadeInDown.duration(260)
        .delay(index * 60)
        .easing(Easing.out(Easing.ease))}
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
