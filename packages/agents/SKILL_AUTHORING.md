# Skill Authoring Guide

This guide explains how to create or update a built-in skill for the `packages/agents` package.

It is intentionally opinionated. The goal is to produce skills that:

- trigger reliably
- stay portable
- work with this repo's artifact-local `.max` runtime model
- prefer progressive disclosure over giant `SKILL.md` files

## Runtime Model In This Repo

Built-in skill source lives in:

```text
packages/agents/skills/<skill-name>/
```

At runtime, a user installs a built-in skill into an artifact with `addSkill(skillName, artifactDir)`.
That creates an installed copy at:

```text
<artifactDir>/.max/skills/<skill-name>/
```

Important consequences:

- `packages/agents/skills/` is the source of truth for built-in skills.
- The agent sees installed skills only, not every bundled skill automatically.
- Relative paths inside `SKILL.md` should make sense from the skill root.
- Artifact-local temporary files belong under `<artifactDir>/.max/temp/<skill-name>/`.
- Final user-facing outputs belong in the artifact directory unless the user asks otherwise.

## Built-In Registry

Built-in skills are allowlisted in:

```text
packages/agents/skills/registry.json
```

Every built-in skill must:

- have a folder under `packages/agents/skills/`
- have a `SKILL.md`
- have a matching registry entry

Tests validate that registry entries match skill folders and frontmatter.

## Required Skill Shape

Recommended layout:

```text
packages/agents/skills/
  <skill-name>/
    SKILL.md
    scripts/        # optional
    references/     # optional
    assets/         # optional
    evals/          # optional, follow-up scope in this repo
```

Do not add extra repo-only clutter inside a skill directory.

## `SKILL.md` Contract

Every skill must start with YAML frontmatter:

```md
---
name: skill-name
description: Describe what the skill does and when to use it.
---
```

Optional fields such as `compatibility` are fine.

Current repo expectations:

- `name` should match the folder name
- `description` should be explicit trigger guidance, not marketing copy
- keep the body concise and move details into `references/` when useful

## Writing Good Descriptions

The description is the trigger. Write it like matching logic.

Good pattern:

```text
Use this skill when ...
This includes ...
Trigger especially when ...
Do not trigger when ...
```

Include:

- file extensions when relevant
- common user words
- the kinds of tasks that should trigger the skill
- nearby cases that should not trigger it

## Path Rules

### Bundled files

Reference bundled files relative to the skill root:

```md
Read [the runtime guide](references/runtime-model.md).
Run `node scripts/example.mjs --help`.
```

### Artifact-local temp files

When the skill expects the agent to create temporary files, use:

```text
<artifactDir>/.max/temp/<skill-name>/
```

Use that location for:

- scratch scripts
- unpacked documents
- previews
- logs
- JSON summaries
- intermediate outputs

Do not tell the agent to create a second project/workspace inside `.max`.

## Script Rules

Bundled scripts should be directly runnable.

Preferred properties:

- non-interactive
- `--help` support
- clear usage and error messages
- structured stdout when returning machine-readable data
- diagnostics on stderr
- explicit exit codes

For JS/TS-based bundled scripts in this repo:

- ship executable `.js` or `.mjs` entrypoints
- avoid requiring a generated shared workspace
- avoid repo-local path assumptions
- import public package names only

For Python scripts:

- assume only documented external tooling
- keep `--help` safe and useful
- avoid hidden install/setup steps when possible

## Progressive Disclosure

Keep the loading model lightweight:

1. Frontmatter gives the agent `name` and `description`
2. `SKILL.md` gives the main workflow
3. `references/`, `scripts/`, and `assets/` are loaded only when needed

Prefer small focused reference files over giant monolithic docs.

## Testing Checklist

Before considering a skill update complete:

1. confirm the registry entry matches the folder and frontmatter
2. confirm no docs reference the retired shared-workspace layout or artifact-name temp paths
3. run `--help` on representative bundled scripts
4. verify the skill makes sense from the installed-skill root
5. verify temporary output guidance points to `<artifactDir>/.max/temp/<skill-name>/`

## What To Avoid

- assuming a generated pnpm workspace exists
- telling the agent to install helper dependencies into a shared skill workspace
- using `skills/<skill-name>/...` paths as if the agent is standing above all installed skills
- writing long trigger logic only in the body while keeping the description vague
- shipping scripts that block on prompts or TTY input
