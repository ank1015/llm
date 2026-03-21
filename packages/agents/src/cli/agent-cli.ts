#!/usr/bin/env node

import { realpath, stat } from 'node:fs/promises';
import { basename, dirname, join, resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { addSkill } from '../agents/skills/index.js';
import { createSystemPrompt } from '../agents/system-prompt.js';
import { createAllTools } from '../tools/index.js';
import { isMainModule } from '../utils/is-main-module.js';

import { isReadlineInterruptError, runInteractiveCliSession } from './shared.js';

import type { AgentTool } from '@ank1015/llm-sdk';

export { extractAssistantText, isExitCommand } from './shared.js';

export interface CliDirectoryContext {
  projectName: string;
  projectDir: string;
  artifactName: string;
  artifactDir: string;
}

export function resolveCliDirectoryContext(directory: string): CliDirectoryContext {
  const artifactDir = resolve(directory);
  const artifactName = basename(artifactDir) || 'artifact';
  const projectDir = dirname(artifactDir);
  const projectName = basename(projectDir) || artifactName;

  return {
    projectName,
    projectDir,
    artifactName,
    artifactDir,
  };
}

function createCliSystemPromptOverrides(context: CliDirectoryContext): {
  project_information: string;
  working_dir: string;
  agent_state: string;
} {
  const stateDir = join(context.artifactDir, '.max');
  const skillsDir = join(stateDir, 'skills');
  const tempDir = join(stateDir, 'temp');

  return {
    project_information: `- Max is working in this directory: ${context.artifactDir}.`,
    working_dir: `Max is currently working in the following directory:
- working dir: ${context.artifactDir}

- The tools are initialized in this directory, and Max should treat it as the default working area.
- Max should read and write files relative to this directory unless the user explicitly asks for another location.
- If Max needs to inspect files outside this directory, Max should do so explicitly and avoid modifying them unless the user asks.`,
    agent_state: `- Agent-local state lives under: ${stateDir}
- Installed skills live under: ${skillsDir}
- Max may use ${tempDir} as writable scratch space for temporary files, helper projects, scripts, installs, previews, logs, JSON summaries, unpacked folders, and other ephemeral outputs.
- ${tempDir} may already be initialized as a lightweight TypeScript workspace for helper-backed skills, including a \`package.json\`, \`tsconfig.json\`, and \`scripts/\` folder.
- When that temp workspace already exists, Max should inspect it and reuse it instead of creating a new scratch setup.
- Max may place one-off TypeScript helper scripts inside ${tempDir}/scripts and run them from ${tempDir} when that workspace fits the task.
- Final user-facing outputs should be written inside ${context.artifactDir} unless the user explicitly asks for a different location.
- Max should treat ${tempDir} as ephemeral scratch space. Other contents under ${stateDir} are agent state, not normal project files.
- Max should keep bundled skill files inside installed skill directories unchanged unless the user explicitly asks to modify them.`,
  };
}

async function resolveExistingDirectory(directoryInput: string): Promise<CliDirectoryContext> {
  const requestedPath = directoryInput.trim() || process.cwd();
  const resolvedPath = resolve(requestedPath);
  const stats = await stat(resolvedPath);
  if (!stats.isDirectory()) {
    throw new Error(`Path is not a directory: ${resolvedPath}`);
  }

  return resolveCliDirectoryContext(await realpath(resolvedPath));
}

export async function runAgentCli(): Promise<void> {
  const readline = createInterface({ input: process.stdin, output: process.stdout });

  try {
    let directoryInput: string;
    try {
      directoryInput = await readline.question(`Run agent in directory [${process.cwd()}]: `);
    } catch (error) {
      if (isReadlineInterruptError(error)) {
        return;
      }
      throw error;
    }

    const context = await resolveExistingDirectory(directoryInput);

    process.stdout.write(`\nPreparing agent for ${context.artifactDir}\n`);
    await addSkill('ai-images', context.artifactDir);
    await addSkill('web', context.artifactDir);

    // createAllTools returns concrete AgentTool specializations; the shared CLI
    // session runner expects the widened AgentTool interface.
    const tools = Object.values(createAllTools(context.artifactDir)) as unknown as AgentTool[];
    const systemPrompt = await createSystemPrompt({
      ...context,
      ...createCliSystemPromptOverrides(context),
    });

    await runInteractiveCliSession({
      projectName: context.projectName,
      sessionName: `${context.artifactName} CLI Session`,
      sessionArchiveSubdir: 'agent-cli',
      workingDir: context.artifactDir,
      systemPrompt,
      tools,
      introLines: [
        `Using codex/gpt-5.4 with directory-local tools in ${context.artifactDir}`,
        'Type a prompt and press Enter. Type "exit" to quit.',
      ],
    });
  } finally {
    readline.close();
  }
}

if (isMainModule(import.meta.url)) {
  void runAgentCli();
}
