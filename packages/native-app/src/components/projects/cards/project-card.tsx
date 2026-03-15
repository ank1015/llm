import { type ProjectCardProps, ProjectCardTrigger } from './project-card-base';

export function ProjectCard({ index, onContextMenuPress, onOpenPress, project }: ProjectCardProps) {
  return (
    <ProjectCardTrigger
      index={index}
      onLongPress={onContextMenuPress}
      onOpenPress={onOpenPress}
      project={project}
    />
  );
}
