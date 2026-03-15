# `@ank1015/llm-agents`

Node-only, opinionated general-purpose agent toolkit for the `@ank1015/llm` monorepo.

This package is the home of:

- general-purpose agent tools for file exploration, reading, editing, writing, and shell execution
- system-prompt construction for the monorepo's general-purpose agent
- bundled skill packaging and installation
- helper-backed skill APIs such as AI image generation/editing

## What It Exports

The current public surface is organized around four areas:

- tools
  - `createAllTools()`, `createCodingTools()`, `createReadOnlyTools()`
  - `read`, `write`, `edit`, `bash`, `grep`, `find`, `ls`
- prompt/runtime helpers
  - `createSystemPrompt()`
- skill runtime
  - `listBundledSkills()`, `listInstalledSkills()`, `addSkill()`, `deleteSkill()`
- helper-backed skill APIs
  - `createImage()`
  - `editImage()`

```ts
import {
  addSkill,
  createAllTools,
  createImage,
  createSystemPrompt,
  listBundledSkills,
} from '@ank1015/llm-agents';
```

## Node-Only Runtime

`@ank1015/llm-agents` is intentionally Node-only.

It assumes access to:

- the local filesystem
- shell execution
- local applications and runtimes
- artifact-local agent state under `.max/`

This is not a browser-compatible package.

## Skills

Bundled skills live under `skills/` and are installed into an artifact-local `.max/skills/`
directory.

Skills follow an overview-first structure:

- `SKILL.md` is the overview and navigation layer
- `references/` holds task-specific details that should only be read when needed

The current bundled skill is:

- `ai-images`
  - overview: [skills/ai-images/SKILL.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/ai-images/SKILL.md)
  - task-specific references for image creation and image editing

## Helper-Backed Temp Workspace

Some skills are helper-backed. When those skills are installed, the package prepares a reusable
TypeScript workspace under `.max/temp/`.

That workspace is intended for one-off helper scripts and includes:

- `package.json`
- `tsconfig.json`
- `scripts/`
- access to `@ank1015/llm-agents`
- access to `tsx`

This lets the agent write and run short TypeScript scripts without needing to bootstrap a fresh
project every time.

## AI Image Helpers

The first helper-backed skill is `ai-images`.

Import the helpers from the package root:

```ts
import { createImage, editImage } from '@ank1015/llm-agents';
```

These helpers:

- use the package's skill-oriented abstractions instead of lower-level provider wiring
- work with the default file keys adapter automatically
- support OpenAI and Google image models currently exposed by the monorepo

See the skill docs for the task-specific API guidance:

- [create.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/ai-images/references/create.md)
- [edit.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/ai-images/references/edit.md)

## Docs

- [docs/vision.md](/Users/notacoder/Desktop/agents/llm/packages/agents/docs/vision.md)
- [docs/adding-skills.md](/Users/notacoder/Desktop/agents/llm/packages/agents/docs/adding-skills.md)
- [docs/testing.md](/Users/notacoder/Desktop/agents/llm/packages/agents/docs/testing.md)

## Commands

- `pnpm build`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:coverage`
- `pnpm typecheck`
- `pnpm lint`
