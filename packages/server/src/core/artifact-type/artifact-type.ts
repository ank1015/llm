import { createBaseSystemPrompt, baseTools } from './base.js';

import type { Skill } from './utils.js';
import type { ArtifactType } from '../types.js';
import type { Tool, ToolName, ToolsOptions } from '@ank1015/llm-agents';

/** Arguments passed to the system prompt factory */
export interface SystemPromptContext {
  artifactDirectory: string;
  projectDirectory: string;
  skills: Skill[];
}

/** Configuration for an artifact type that determines session behavior */
export interface ArtifactTypeConfig {
  /** The artifact type identifier */
  type: ArtifactType;
  /** Factory that builds the system prompt from runtime context */
  createSystemPrompt: (ctx: SystemPromptContext) => string;
  /** Factory function that creates tools scoped to a working directory */
  createTools: (cwd: string, options?: ToolsOptions) => Record<ToolName, Tool>;
}

const artifactTypeConfigs: Record<ArtifactType, ArtifactTypeConfig> = {
  base: {
    type: 'base',
    createSystemPrompt: (ctx) =>
      createBaseSystemPrompt(ctx.artifactDirectory, ctx.projectDirectory, ctx.skills),
    createTools: baseTools,
  },
  research: {
    type: 'research',
    createSystemPrompt: (ctx) =>
      createBaseSystemPrompt(ctx.artifactDirectory, ctx.projectDirectory, ctx.skills),
    createTools: baseTools,
  },
  code: {
    type: 'code',
    createSystemPrompt: (ctx) =>
      createBaseSystemPrompt(ctx.artifactDirectory, ctx.projectDirectory, ctx.skills),
    createTools: baseTools,
  },
};

/** Get the configuration for an artifact type. Defaults to 'base' for unknown types. */
export function getArtifactTypeConfig(type: ArtifactType | undefined): ArtifactTypeConfig {
  return artifactTypeConfigs[type ?? 'base'] ?? artifactTypeConfigs.base;
}
