import { arch, platform, release } from 'node:os';

import { createBashTool } from '@ank1015/llm-agents';
import { agent, tool, userMessage } from '@ank1015/llm-sdk';
import { Type } from '@sinclair/typebox';

import { getSetupRequirementsContext, getSetupStatus } from '../setup.js';

import type { SetupRequirementsContext, SetupStatus } from '../../contracts/index.js';
import type { AgentEvent, AgentTool, CuratedModelId, ReasoningEffort } from '@ank1015/llm-sdk';

const SETUP_AGENT_MODEL_ID = 'azure-openai/gpt-5.4' as const satisfies CuratedModelId;
const SETUP_AGENT_REASONING_EFFORT = 'high' as const satisfies ReasoningEffort;
const SETUP_AGENT_MAX_TURNS = 30;

export type SetupAgentConfig = {
  readonly modelId: CuratedModelId;
  readonly reasoningEffort: ReasoningEffort;
  readonly systemPrompt: string;
  readonly userPrompt: string;
  readonly tools: AgentTool[];
};

export async function runSetupAgent(input: {
  readonly initialStatus: SetupStatus;
  readonly onEvent: (event: AgentEvent) => void;
  readonly signal?: AbortSignal;
}): Promise<{ ready: boolean }> {
  const config = await createSetupAgentConfig(input.initialStatus);
  const run = agent({
    modelId: config.modelId,
    reasoningEffort: config.reasoningEffort,
    system: config.systemPrompt,
    inputMessages: [userMessage(config.userPrompt)],
    tools: config.tools,
    maxTurns: SETUP_AGENT_MAX_TURNS,
    ...(input.signal ? { signal: input.signal } : {}),
  });

  for await (const event of run) {
    input.onEvent(event);
  }

  const result = await run;
  if (!result.ok && result.error.phase !== 'aborted') {
    throw new Error(result.error.message);
  }

  const status = await getSetupStatus();
  return { ready: status.ready };
}

export async function createSetupAgentConfig(status: SetupStatus): Promise<SetupAgentConfig> {
  const context = await getSetupRequirementsContext();
  const missing = status.checks.filter((check) => !check.installed);

  return {
    modelId: SETUP_AGENT_MODEL_ID,
    reasoningEffort: SETUP_AGENT_REASONING_EFFORT,
    systemPrompt: createSetupAgentSystemPrompt(context),
    userPrompt: [
      'Help install the missing setup requirements for this device.',
      '',
      `Missing requirements: ${missing.map((check) => check.label).join(', ') || 'none'}`,
      '',
      'Run the smallest useful install/check steps, then call check_setup_requirements.',
      'When all requirements are installed, tell the user setup is ready to continue.',
    ].join('\n'),
    tools: [
      createBashTool(process.cwd()),
      createCheckSetupRequirementsTool(),
    ] as unknown as AgentTool[],
  };
}

export function createCheckSetupRequirementsTool(): AgentTool {
  return tool({
    name: 'check_setup_requirements',
    description:
      'Check whether Node.js, npx, Python, Git, and chrome-controller are installed and return setup/runtime context.',
    parameters: Type.Object({}, { additionalProperties: false }),
    execute: async () => {
      const context = await getSetupRequirementsContext();

      return {
        content: [{ type: 'text', content: formatSetupRequirementsContext(context) }],
        details: context,
      };
    },
  }) as unknown as AgentTool;
}

function createSetupAgentSystemPrompt(context: SetupRequirementsContext): string {
  return [
    'You are the setup agent for the LLM desktop app.',
    'Your job is to install missing local dependencies so the app can work on this device.',
    '',
    '<current_setup_context>',
    JSON.stringify(context, null, 2),
    '</current_setup_context>',
    '',
    '<installation_priority>',
    '1. Node.js and npx',
    '2. Python',
    '3. Git',
    '4. chrome-controller',
    '</installation_priority>',
    '',
    '<installation_command_examples>',
    'Node.js and npx:',
    '',
    'Python:',
    '',
    'Git:',
    '',
    'chrome-controller:',
    '- npm i -g @ank1015/chrome-controller',
    '',
    '</installation_command_examples>',
    '',
    '<instructions>',
    '- Use only the tools available to you.',
    '- Use bash to run installation commands on the user device.',
    '- Use check_setup_requirements after install attempts to verify progress.',
    '- Setup is complete only when check_setup_requirements reports ready: true.',
    '- Install missing requirements in the priority order listed above.',
    '- Prefer one dependency or tightly related command group at a time.',
    '- Do not try to install chrome-controller until Node.js and npx are installed.',
    '- Keep final messages concise and tell the user when they can continue.',
    '- If a command fails, inspect the output and try the next practical install path for the OS.',
    '</instructions>',
    '',
    '<runtime_hint>',
    `platform: ${platform()}`,
    `arch: ${arch()}`,
    `release: ${release()}`,
    '</runtime_hint>',
  ].join('\n');
}

function formatSetupRequirementsContext(context: SetupRequirementsContext): string {
  const lines = [
    `ready: ${context.status.ready ? 'true' : 'false'}`,
    `setupComplete: ${context.status.setupComplete ? 'true' : 'false'}`,
    `platform: ${context.runtime.platform}`,
    `arch: ${context.runtime.arch}`,
    `release: ${context.runtime.release}`,
    '',
    'requirements:',
  ];

  for (const check of context.status.checks) {
    lines.push(
      `- ${check.label}: ${check.installed ? 'installed' : 'missing'}${
        check.version ? ` (${check.version})` : ''
      }`
    );
  }

  return lines.join('\n');
}
