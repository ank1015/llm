import Feather from '@expo/vector-icons/Feather';
import { BrowserIcon, Image03Icon } from '@hugeicons/core-free-icons';
import { HugeiconsIcon } from '@hugeicons/react-native';

import type { IconSvgElement } from '@hugeicons/react-native';

export const SKILL_ICON_MAP: Record<string, IconSvgElement> = {
  'ai-images': Image03Icon,
  web: BrowserIcon,
};

export function SkillIcon({
  color,
  size = 18,
  skillName,
  strokeWidth = 1.5,
}: {
  color: string;
  size?: number;
  skillName: string;
  strokeWidth?: number;
}) {
  const icon = SKILL_ICON_MAP[skillName];

  if (!icon) {
    return <Feather color={color} name="tool" size={size} />;
  }

  return <HugeiconsIcon icon={icon} size={size} color={color} strokeWidth={strokeWidth} />;
}
