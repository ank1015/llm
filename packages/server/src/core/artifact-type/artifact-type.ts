import { createAllTools } from '../tools/index.js';

import type { Tool, ToolName, ToolsOptions } from '../tools/index.js';
import type { ArtifactType } from '../types.js';

/** Configuration for an artifact type that determines session behavior */
export interface ArtifactTypeConfig {
  /** The artifact type identifier */
  type: ArtifactType;
  /** System prompt injected into every session conversation */
  systemPrompt: string;
  /** Factory function that creates tools scoped to a working directory */
  createTools: (cwd: string, options?: ToolsOptions) => Record<ToolName, Tool>;
}

const DEFAULT_SYSTEM_PROMPT =
  'You are a helpful AI assistant with access to tools for reading, writing, and editing files, running commands, and searching codebases.';

const artifactTypeConfigs: Record<ArtifactType, ArtifactTypeConfig> = {
  base: {
    type: 'base',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    createTools: createAllTools,
  },
  research: {
    type: 'research',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    createTools: createAllTools,
  },
  code: {
    type: 'code',
    systemPrompt: DEFAULT_SYSTEM_PROMPT,
    createTools: createAllTools,
  },
};

/** Get the configuration for an artifact type. Defaults to 'base' for unknown types. */
export function getArtifactTypeConfig(type: ArtifactType | undefined): ArtifactTypeConfig {
  return artifactTypeConfigs[type ?? 'base'] ?? artifactTypeConfigs.base;
}
