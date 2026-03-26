import { AiBrain03Icon, BrowserIcon, Image03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react';
import { Sparkles } from 'lucide-react';

import type { IconSvgElement } from '@hugeicons/react';

import { cn } from '@/lib/utils';

export const SKILL_ICON_MAP: Record<string, IconSvgElement> = {
  'ai-images': Image03Icon,
  'use-llms': AiBrain03Icon,
  web: BrowserIcon,
};

export function SkillIcon({
  skillName,
  size = 16,
  strokeWidth = 1.5,
  className,
}: {
  skillName: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  const icon = SKILL_ICON_MAP[skillName];

  if (!icon) {
    return <Sparkles size={size} strokeWidth={strokeWidth} className={cn(className)} />;
  }

  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      color="currentColor"
      strokeWidth={strokeWidth}
      className={cn(className)}
    />
  );
}
