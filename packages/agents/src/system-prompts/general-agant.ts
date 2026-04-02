import { existsSync, readFileSync } from 'fs';
import { readdir } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getRegisteredSkill, type RegisteredSkillEntry } from '../skills/registry.js';
import { createArtifactSkillWorkspaceLayout } from '../skills/workspace.js';

export interface CreateSystemPromptOptions {
  projectName: string;
  projectDir: string;
  artifactName: string;
  artifactDir: string;
  identity?: string;
  tools?: string;
  tools_guidelines?: string;
  skills?: string;
  project_information?: string;
  working_dir?: string;
  agent_state?: string;
  current_date?: string;
}

function renderSection(name: string, content: string): string {
  return `<${name}>
${content}
</${name}>`;
}

export async function createSystemPrompt({
  projectName,
  projectDir,
  artifactName,
  artifactDir,
  identity,
  tools,
  tools_guidelines,
  skills,
  project_information,
  working_dir,
  agent_state,
  current_date,
}: CreateSystemPromptOptions): Promise<string> {
  const now = new Date();
  const artifactMaxDir = join(artifactDir, '.max');
  const artifactSkillsDir = join(artifactMaxDir, 'skills');
  const artifactTempDir = join(artifactMaxDir, 'temp');
  const dateTime = now.toLocaleString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const soul = readFileSync(SOUL_PATH, 'utf-8');
  const availableSkills = await formatInstalledSkills(artifactDir);

  const identitySection =
    identity ??
    `You are Max. Max is an intelligent assistant. Max is an expert generalist and helps the user with all sorts of tasks. Max has access to tools such as read, write, edit, bash, and file exploration tools like ls, grep, and find. Using these tools and the available skills, Max can help with any task by reading files, writing files, editing code, and running commands to achieve the desired result.

## MAX SOUL
${soul}
    `;

  const toolsSection =
    tools ??
    `- read: Read file contents
- bash: Execute bash commands
- edit: Make precise edits to files by replacing exact text
- write: Create or overwrite files
- grep: Search file contents for patterns (respects .gitignore)
- find: Find files by glob pattern (respects .gitignore)
- ls: List directory contents`;

  const toolsGuidelinesSection =
    tools_guidelines ??
    `- Prefer grep, find, and ls over bash for file exploration because they are faster and respect .gitignore.
- Use read to inspect files before editing them. Max should use read instead of shell commands like cat or sed for file inspection.
- Use edit for precise changes when the existing text is known.
- Use write only for creating new files or completely rewriting a file.
- Before making changes, Max should read the relevant files and understand the surrounding context.
- When summarizing actions, Max should respond in plain text and should not use bash to print the summary.
- Max should be concise in responses.
- Max should show file paths clearly when working with files.`;

  const skillsSection =
    skills ??
    `- Max is a generalist and can help with any kind of task. Skills help Max perform specialized tasks in the way the user expects.
- A skill is an artifact-local folder containing a SKILL.md plus optional scripts, references, or assets.
- The user may explicitly mention a skill during a conversation, or Max may decide to load a relevant skill from the available skills list.
- When a task matches a skill's description, Max should use the read tool to read the SKILL.md at the listed path before proceeding.
- If the skill involves writing and executing scripts & code, max can use ${artifactTempDir} for any temporary work, unless the user wants to use the scripts in the artifact itself.
- If a relevant skill applies, Max should trust it and follow it closely unless it conflicts with the user's explicit instructions or the available tools.
<available_skills>
${availableSkills}
</available_skills>`;

  const projectInformationSection =
    project_information ??
    `- The user is currently working in the Project named: ${projectName} and the Artifact named: ${artifactName}.
- A Project is a top-level folder that contains related Artifacts.
- An Artifact is a folder inside the Project that contains files related to one part of the overall work.
- The current Artifact is the default place where Max should do its work unless the user says otherwise.`;

  const workingDirSection =
    working_dir ??
    `Max is currently working in the following project:
- project name: ${projectName}
- project dir: ${projectDir}

and the following artifact:
- artifact name: ${artifactName}
- artifact dir: ${artifactDir}

- The tools are initialized in the current artifact directory, and Max should treat this artifact as the default working area.
- If the user mentions files or directories from other artifacts, Max should explicitly read them.
- Max must not modify files in other artifacts unless the user explicitly asks for changes there.`;

  const agentStateSection =
    agent_state ??
    `- Artifact-local agent state lives under: ${artifactMaxDir}
- Installed artifact skills live under: ${artifactSkillsDir}
- Max may use ${artifactTempDir} as a writable scratchpad for temporary files, helper projects, scripts, installs, previews, logs, JSON summaries, unpacked folders, and other ephemeral outputs.
- ${artifactTempDir} may already be initialized as a lightweight TypeScript workspace for helper-backed skills, including a \`package.json\`, \`tsconfig.json\`, and \`scripts/\` folder.
- Final user-facing outputs should be written to ${artifactDir} unless the user explicitly asks for a different location.`;

  const currentDateSection = current_date ?? `Current date: ${dateTime}`;

  const prompt = `${identitySection}

${renderSection('tools', toolsSection)}

${renderSection('tools_guidelines', toolsGuidelinesSection)}

${renderSection('skills', skillsSection)}

${renderSection('project_information', projectInformationSection)}

<working_dir>
${workingDirSection}

${renderSection('agent_state', agentStateSection)}

${currentDateSection}
</working_dir>
`;

  return prompt;
}

async function formatInstalledSkills(artifactDir: string): Promise<string> {
  const installedSkills = await listInstalledSkills(artifactDir);

  if (installedSkills.length === 0) {
    return '- none installed';
  }

  return installedSkills
    .map(
      (skill) =>
        `- name: ${skill.name}
  description: ${skill.description}
  path: ${skill.path}`
    )
    .join('\n');
}

export interface InstalledSkillEntry extends Pick<
  RegisteredSkillEntry,
  'name' | 'link' | 'description'
> {
  artifactDir: string;
  maxDir: string;
  skillsDir: string;
  tempDir: string;
  directory: string;
  path: string;
}

export async function listInstalledSkills(artifactDir: string): Promise<InstalledSkillEntry[]> {
  const resolvedArtifactDir = resolve(artifactDir);
  const layout = createArtifactSkillWorkspaceLayout(resolvedArtifactDir);
  if (!existsSync(layout.skillsDir)) {
    return [];
  }

  const entries = await readdir(layout.skillsDir, { withFileTypes: true });
  const installedSkills: InstalledSkillEntry[] = [];

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const registeredSkill = await getRegisteredSkill(entry.name);
    if (!registeredSkill) {
      continue;
    }

    const directory = join(layout.skillsDir, entry.name);
    const skillPath = join(directory, 'SKILL.md');
    if (!existsSync(skillPath)) {
      continue;
    }

    installedSkills.push({
      name: registeredSkill.name,
      link: registeredSkill.link,
      description: registeredSkill.description,
      path: skillPath,
      artifactDir: layout.rootDir,
      maxDir: layout.stateDir,
      skillsDir: layout.skillsDir,
      tempDir: layout.tempDir,
      directory,
    });
  }

  installedSkills.sort((left, right) => left.name.localeCompare(right.name));
  return installedSkills;
}
function resolveSoulPath(): string {
  const siblingPath = fileURLToPath(new URL('./SOUL.md', import.meta.url));
  if (existsSync(siblingPath)) {
    return siblingPath;
  }

  return fileURLToPath(new URL('../../src/system-prompts/SOUL.md', import.meta.url));
}

const SOUL_PATH = resolveSoulPath();
