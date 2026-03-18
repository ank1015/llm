# @ank1015/llm-agents

Node-only general-purpose agent toolkit for the LLM monorepo.

## Commands

- `pnpm build` — Clean and compile TypeScript to `dist/`
- `pnpm agent:cli` — Start the local directory-scoped agent CLI
- `pnpm dev` — Watch mode compilation
- `pnpm test` — Run unit and integration tests
- `pnpm test:unit` — Run unit tests
- `pnpm test:integration` — Run integration tests
- `pnpm test:coverage` — Run tests with coverage
- `pnpm typecheck` — Type-check without emitting
- `pnpm lint` — Run ESLint for the package
- `pnpm clean` — Remove build artifacts

## Structure

```
src/
  index.ts              — Public package exports
  agents/
    skills/index.ts     — Skill registry, install, list, delete, and temp-project setup
    system-prompt.ts    — General-purpose agent system prompt
    tools.ts            — Agent-facing tool entrypoint re-export
  cli/
    agent-cli.ts        — Local directory-scoped CLI agent runner
  helpers/
    ai-image/           — Helper-backed skill code for image generation/editing
    web/                — Helper-backed browser session and tab/debugger helpers
  tools/
    index.ts            — Tool exports and shared entrypoint
    *.ts                — Core general-purpose tools (read, write, edit, bash, grep, find, ls)
    utils/              — Shared tool utilities
skills/
  registry.json         — Discoverability metadata for bundled skills
  ai-images/            — Helper-backed bundled skill
    references/         — Model-selection plus task-specific image references
  web/                  — Helper-backed bundled browser skill
    references/         — API, workflow, and task-specific browser references
docs/
  vision.md             — Package philosophy
  adding-skills.md      — Skill authoring conventions
  testing.md            — Validation and packaging guidance
tests/
  unit/                 — Unit tests for package exports and skill runtime
  integration/          — Integration tests including temp helper workspace smoke coverage
```

## Package Role

- Exposes the general-purpose tool layer used by the monorepo's agent runtime.
- Owns bundled skill packaging and installation under `.max/skills/`.
- Owns helper-backed skill APIs exported from `@ank1015/llm-agents`, including AI image and web/browser helpers.
- Supports a reusable `.max/temp/` TypeScript workspace for helper-backed skills.
- Includes a local CLI runner for temporary directory-scoped agent sessions.
