#!/usr/bin/env node

import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

import { prepareSkillTesterWorkspace } from '../agents/skills/tester.js';
import { createSystemPrompt } from '../agents/system-prompt.js';
import { createAllTools } from '../tools/index.js';

import { runInteractiveCliSession } from './shared.js';

import type { WorkspaceInstalledSkillEntry } from '../agents/skills/runtime.js';
import type { AgentTool } from '@ank1015/llm-sdk';

export interface SkillTesterCliArgs {
  skillName: string;
  prompt?: string;
}

export interface SkillTesterContext {
  skillName: string;
  packageRoot: string;
  workspaceRoot: string;
  skillsDir: string;
  tempDir: string;
  installedSkills: WorkspaceInstalledSkillEntry[];
}

export function parseSkillTesterCliArgs(argv: string[]): SkillTesterCliArgs {
  const args = argv
    .map((value) => value.trim())
    .filter((value) => value.length > 0 && value !== '--');

  const positionalArgs: string[] = [];
  let prompt: string | undefined;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (!arg) {
      continue;
    }

    const promptFlag = parseSkillTesterPromptFlag({
      args,
      index,
      currentPrompt: prompt,
    });
    if (promptFlag) {
      prompt = promptFlag.prompt;
      index = promptFlag.nextIndex;
      continue;
    }

    positionalArgs.push(arg);
  }

  if (positionalArgs.length === 0) {
    throw new Error(
      'Missing skill name. Usage: pnpm --filter @ank1015/llm-agents skill:tester -- <skill-name> [--prompt "your prompt"]'
    );
  }

  if (positionalArgs.length > 1) {
    throw new Error(`Expected exactly one skill name. Received: ${positionalArgs.join(', ')}`);
  }

  const skillName = positionalArgs[0];
  if (!skillName) {
    throw new Error('Missing skill name.');
  }

  return {
    skillName,
    ...(prompt !== undefined ? { prompt } : {}),
  };
}

export function resolveSkillTesterTargetSkill(argv: string[]): string {
  return parseSkillTesterCliArgs(argv).skillName;
}

export function createSkillTesterSystemPromptOverrides({
  packageRoot,
  workspaceRoot,
  skillsDir,
  tempDir,
  installedSkills,
}: Omit<SkillTesterContext, 'skillName'>): {
  skills: string;
  project_information: string;
  working_dir: string;
  agent_state: string;
} {
  const availableSkills =
    installedSkills.length === 0
      ? '- none installed'
      : installedSkills
          .map(
            (skill) =>
              `- name: ${skill.name}
  description: ${skill.description}
  path: ${skill.path}`
          )
          .join('\n');

  return {
    skills: `- Max is a generalist and can help with any kind of task. Skills help Max perform specialized tasks in the way the user expects.
- A skill is an installed folder containing a SKILL.md plus optional scripts, references, or assets.
- Only the skills listed below are installed in this skill tester workspace.
- When a task matches a skill's description, Max should read the SKILL.md at the listed path before proceeding.
- Some skills are helper-backed and teach Max to import functions from \`@ank1015/llm-agents\`.
- For this tester flow, the installed copies under ${skillsDir} are disposable validation artifacts, not the source of truth.
- If Max needs to change the real bundled skill docs or helper implementations, Max should edit files under ${packageRoot}/skills/ or ${packageRoot}/src/helpers/ explicitly.
- Max should keep the installed copies under ${skillsDir} unchanged unless the task is specifically validating or inspecting the installed output.
- When a helper-backed skill applies, Max may use those helpers from the temp workspace under \`${tempDir}\` or from code written elsewhere when that better fits the task.
<available_skills>
${availableSkills}
</available_skills>`,
    project_information: `- Max is testing bundled skills for the package named: ${basename(packageRoot)}.
- The disposable skill tester workspace lives at: ${workspaceRoot}
- The skill tester workspace is the default place to run helper scripts and inspect installed skill copies.
- The source of truth for bundled skills and helpers remains under ${packageRoot}.`,
    working_dir: `Max is currently working in the following directory:
- working dir: ${workspaceRoot}

- The tools are initialized in this tester workspace, and Max should treat it as the default working area.
- If Max needs to inspect or modify the real package source, Max should do so explicitly under ${packageRoot}.
- Max should not assume files inside ${workspaceRoot} are permanent project assets.`,
    agent_state: `- Skill tester state lives under: ${workspaceRoot}
- Installed skills live under: ${skillsDir}
- Max may use ${tempDir} as writable scratch space for helper scripts, temporary files, previews, logs, JSON summaries, and other ephemeral outputs.
- ${tempDir} may already be initialized as a lightweight TypeScript workspace for helper-backed skills, including a \`package.json\`, \`tsconfig.json\`, and \`scripts/\` folder.
- When that temp workspace already exists, Max should inspect it and reuse it instead of creating a new scratch setup.
- Max may place one-off TypeScript helper scripts inside ${tempDir}/scripts and run them from ${tempDir} when that workspace fits the task.
- Final user-facing outputs from this tester flow should stay inside ${workspaceRoot} unless the user explicitly asks to modify the real package source.
- Max should treat ${workspaceRoot} as disposable test state rather than a normal artifact directory.`,
  };
}

export async function runSkillTesterCli(argv: string[] = process.argv.slice(2)): Promise<void> {
  const { skillName, prompt } = parseSkillTesterCliArgs(argv);
  const prepared = await prepareSkillTesterWorkspace(skillName);
  const tools = Object.values(createAllTools(prepared.layout.rootDir)) as unknown as AgentTool[];
  const systemPrompt = await createSystemPrompt({
    projectName: basename(prepared.packageRoot),
    projectDir: prepared.packageRoot,
    artifactName: 'skill-tester',
    artifactDir: prepared.layout.rootDir,
    ...createSkillTesterSystemPromptOverrides({
      packageRoot: prepared.packageRoot,
      workspaceRoot: prepared.layout.rootDir,
      skillsDir: prepared.layout.skillsDir,
      tempDir: prepared.layout.tempDir,
      installedSkills: prepared.installedSkills,
    }),
  });

  const result = await runInteractiveCliSession({
    projectName: basename(prepared.packageRoot),
    sessionName: `${skillName} Skill Tester Session`,
    sessionArchiveSubdir: 'skill-tester',
    workingDir: prepared.layout.rootDir,
    systemPrompt,
    tools,
    ...(prompt !== undefined ? { oneShotPrompt: prompt } : {}),
    introLines:
      prompt === undefined
        ? [
            `Testing bundled skill "${skillName}" in ${prepared.layout.rootDir}`,
            `Using source package at ${prepared.packageRoot}`,
            'Type a prompt and press Enter. Type "exit" to quit.',
          ]
        : [
            `Testing bundled skill "${skillName}" in ${prepared.layout.rootDir}`,
            `Using source package at ${prepared.packageRoot}`,
            'Running one-shot prompt and exiting when the agent finishes.',
          ],
  });

  if (prompt !== undefined) {
    process.stdout.write('\nFinal response:\n');
    process.stdout.write(`${result.finalResponse ?? '[assistant returned no text response]'}\n`);
  }
}

function resolveSkillTesterPromptValue(
  currentPrompt: string | undefined,
  rawValue: string,
  flag: string
): string {
  if (currentPrompt !== undefined) {
    throw new Error('Expected at most one prompt value.');
  }

  const promptValue = rawValue.trim();
  if (promptValue.length === 0) {
    throw new Error(`Missing prompt text for ${flag}.`);
  }

  return promptValue;
}

function parseSkillTesterPromptFlag({
  args,
  index,
  currentPrompt,
}: {
  args: string[];
  index: number;
  currentPrompt: string | undefined;
}): { prompt: string; nextIndex: number } | undefined {
  const arg = args[index];
  if (!arg) {
    return undefined;
  }

  if (arg === '--prompt' || arg === '-p') {
    const promptValue = args[index + 1];
    if (!promptValue) {
      throw new Error(
        'Missing prompt text for --prompt. Usage: pnpm --filter @ank1015/llm-agents skill:tester -- <skill-name> --prompt "your prompt"'
      );
    }

    return {
      prompt: resolveSkillTesterPromptValue(currentPrompt, promptValue, '--prompt'),
      nextIndex: index + 1,
    };
  }

  if (arg.startsWith('--prompt=')) {
    return {
      prompt: resolveSkillTesterPromptValue(
        currentPrompt,
        arg.slice('--prompt='.length),
        '--prompt'
      ),
      nextIndex: index,
    };
  }

  if (arg.startsWith('-p=')) {
    return {
      prompt: resolveSkillTesterPromptValue(currentPrompt, arg.slice('-p='.length), '-p'),
      nextIndex: index,
    };
  }

  return undefined;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  void runSkillTesterCli();
}
