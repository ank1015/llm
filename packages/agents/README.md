# `@ank1015/llm-agents`

Node-only, opinionated general-purpose agent toolkit for the `@ank1015/llm` monorepo.

This package is the home of:

- general-purpose agent tools for file exploration, reading, editing, writing, and shell execution
- system-prompt construction for the monorepo's general-purpose agent
- bundled skill packaging and installation
- helper-backed skill APIs such as AI image generation/editing and browser automation/debugging
- a local CLI runner for directory-scoped agent sessions

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
  - `connectWeb()`
  - `withWebBrowser()`
  - `WebBrowser`
  - `WebTab`
  - `WebDebuggerSession`

```ts
import {
  addSkill,
  createAllTools,
  createImage,
  createSystemPrompt,
  connectWeb,
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

The current bundled skills are:

- `ai-images`
  - overview: [skills/ai-images/SKILL.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/ai-images/SKILL.md)
  - task-specific references for model choice, image creation, and image editing
- `web`
  - overview: [skills/web/SKILL.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/web/SKILL.md)
  - task-specific references for reading pages, interacting with web apps, network/debug flows, browser-state work, and downloads/uploads

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

## Helper-Backed Skill APIs

The current helper-backed skills are `ai-images` and `web`.

Import the helpers from the package root:

```ts
import {
  WebBrowser,
  WebDebuggerSession,
  WebTab,
  connectWeb,
  createImage,
  editImage,
  withWebBrowser,
} from '@ank1015/llm-agents';
```

The AI image helpers:

- use the package's skill-oriented abstractions instead of lower-level provider wiring
- work with the default file keys adapter automatically
- support OpenAI and Google image models currently exposed by the monorepo

See the skill docs for the task-specific API guidance:

- [choose-model.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/ai-images/references/choose-model.md)
- [create.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/ai-images/references/create.md)
- [edit.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/ai-images/references/edit.md)

The web helpers:

- hide the lower-level `@ank1015/llm-extension` transport details behind a managed browser session
- expose browser, tab, debugger, download, screenshot, and upload helpers through `@ank1015/llm-agents`
- emphasize `evaluate(...)`, readiness checks, and verification over brittle site-specific abstractions
- are documented with an API reference first, then a workflow guide, then task-specific references

See the web skill docs for the task-specific guidance:

- [SKILL.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/web/SKILL.md)
- [api.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/web/references/api.md)
- [workflow.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/web/references/workflow.md)
- [read.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/web/references/read.md)
- [interact.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/web/references/interact.md)
- [debug.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/web/references/debug.md)
- [browser-state.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/web/references/browser-state.md)
- [downloads.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/web/references/downloads.md)
- [recipes.md](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/web/references/recipes.md)

## Local CLI

For local testing and temporary directory-scoped sessions, run:

```bash
pnpm --filter @ank1015/llm-agents agent:cli
```

The CLI:

- asks which directory Max should work in
- installs the `ai-images` and `web` skills into that directory's `.max/skills/`
- uses the file keys adapter for credentials
- uses `codex` / `gpt-5.4` with the package's general-purpose tools

This remains the normal artifact-style flow.

## Skill Tester

For monorepo-local bundled skill iteration without publishing the package, run:

```bash
pnpm --filter @ank1015/llm-agents skill:tester -- <skill-name>
```

The skill tester:

- auto-builds the local package stack with `pnpm build:packages`
- uses a fixed disposable workspace at `packages/agents/.skill-tester/`
- installs only the requested skill into `.skill-tester/skills/`
- prepares `.skill-tester/temp/` as the helper-backed TypeScript workspace
- keeps the source of truth in `packages/agents/skills/` and `packages/agents/src/helpers/`
- roots the agent tools in `.skill-tester/`, so source edits outside that workspace should be explicit

## Docs

- [docs/vision.md](/Users/notacoder/Desktop/agents/llm/packages/agents/docs/vision.md)
- [docs/adding-skills.md](/Users/notacoder/Desktop/agents/llm/packages/agents/docs/adding-skills.md)
- [docs/web-skill-spec.md](/Users/notacoder/Desktop/agents/llm/packages/agents/docs/web-skill-spec.md)
- [docs/testing.md](/Users/notacoder/Desktop/agents/llm/packages/agents/docs/testing.md)

## Commands

- `pnpm build`
- `pnpm agent:cli`
- `pnpm skill:tester -- <skill-name>`
- `pnpm test`
- `pnpm test:unit`
- `pnpm test:integration`
- `pnpm test:coverage`
- `pnpm typecheck`
- `pnpm lint`
