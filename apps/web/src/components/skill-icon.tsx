'use client';

import {
  AiBrain03Icon,
  ChromeIcon,
  Doc02Icon,
  Pdf02Icon,
  Ppt02Icon,
  Xls02Icon,
} from '@hugeicons/core-free-icons';
import { HugeiconsIcon, type IconSvgElement } from '@hugeicons/react';

import skillRegistryData from '@/lib/skills/registry.json';
import { cn } from '@/lib/utils';

type RegisteredSkillRecord = {
  name: string;
  link: string;
  description: string;
};

const REGISTERED_SKILLS = skillRegistryData as RegisteredSkillRecord[];
const EXPLICIT_SKILL_ICON_MAP: Record<string, IconSvgElement> = {
  'chrome-controller': ChromeIcon,
  docx: Doc02Icon,
  llm: AiBrain03Icon,
  pdf: Pdf02Icon,
  pptx: Ppt02Icon,
  xlsx: Xls02Icon,
};
const DEFAULT_SKILL_ICON = AiBrain03Icon;
const REGISTERED_SKILL_ICON_MAP = Object.fromEntries(
  REGISTERED_SKILLS.map((skill) => [
    skill.name,
    EXPLICIT_SKILL_ICON_MAP[skill.name] ?? DEFAULT_SKILL_ICON,
  ])
) as Record<string, IconSvgElement>;

export function SkillIcon({
  skillName,
  size = 15,
  className,
}: {
  skillName: string;
  size?: number;
  className?: string;
}) {
  const icon = REGISTERED_SKILL_ICON_MAP[skillName] ?? DEFAULT_SKILL_ICON;

  return (
    <HugeiconsIcon
      icon={icon}
      size={size}
      color="currentColor"
      strokeWidth={1.5}
      className={cn(className)}
    />
  );
}
