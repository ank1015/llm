import { createAllTools, createSystemPrompt } from '@ank1015/llm-agents';

import type { AgentTool } from '@ank1015/llm-sdk';

export interface CreateServerAgentConfigInput {
  projectName: string;
  projectDir: string;
  artifactName: string;
  artifactDir: string;
  toolCwd?: string;
  systemPromptAppendix?: string;
}

export interface ServerAgentConfig {
  systemPrompt: string;
  tools: AgentTool[];
}

export async function createServerAgentConfig(
  input: CreateServerAgentConfigInput
): Promise<ServerAgentConfig> {
  const baseSystemPrompt = await createSystemPrompt({
    projectName: input.projectName,
    projectDir: input.projectDir,
    artifactName: input.artifactName,
    artifactDir: input.artifactDir,
  });

  return {
    systemPrompt: appendSystemPrompt(baseSystemPrompt, input.systemPromptAppendix),
    tools: Object.values(
      createAllTools(input.toolCwd ?? input.artifactDir)
    ) as unknown as AgentTool[],
  };
}

function appendSystemPrompt(basePrompt: string, appendix?: string): string {
  const trimmedAppendix = appendix?.trim();
  if (!trimmedAppendix) {
    return basePrompt;
  }

  return `${basePrompt.trimEnd()}\n\n${trimmedAppendix}`;
}
