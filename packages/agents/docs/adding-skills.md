# Adding Skills

This package supports two kinds of bundled skills:

- docs-only skills
- helper-backed skills

Both kinds live under `skills/` and are discoverable through `skills/registry.json`.

## Skill Layout

Each skill must follow this structure:

```text
skills/<skill-name>/
  SKILL.md
  references/
```

Rules:

- `SKILL.md` is the overview only.
- `references/` holds API details, workflow guidance, task-specific details, option tables, examples, and deeper guidance.
- Keep references one level deep from `SKILL.md`.
- The skill name in frontmatter must match the folder name and the registry entry.

## Overview-First Convention

`SKILL.md` should:

- describe when the skill applies
- list the available functions or workflows at a high level
- tell the agent exactly which reference file to read next
- avoid loading all task-specific details into the first read

Do not put detailed request shapes, every option, or long examples into `SKILL.md` unless they are
absolutely core to every use of the skill.

For helper-backed skills with a non-trivial public API, prefer putting the exact helper signatures,
option types, return shapes, and behavior notes in a dedicated reference file such as
`references/api.md` instead of crowding `SKILL.md`.

## Registry Convention

Every bundled skill must have an entry in `skills/registry.json`.

Current registry fields:

- `name`
- `description`
- optional `helperProject`

`helperProject` is used for helper-backed skills that need the reusable `.max/temp` TypeScript
workspace prepared during installation.

Current supported value:

```json
{
  "runtime": "typescript",
  "package": "@ank1015/llm-agents"
}
```

## Docs-Only Skills

Use a docs-only skill when:

- the agent mostly needs instructions, conventions, or references
- the task can be handled with existing tools and shell execution
- adding package-level helper code would not meaningfully improve reuse or reliability

Docs-only skills do not need:

- helper code under `src/helpers/`
- root exports
- `helperProject` in the registry

## Helper-Backed Skills

Use a helper-backed skill when:

- the task benefits from a stable package API
- the same low-level integration would otherwise be rewritten repeatedly
- the package can provide a cleaner abstraction than raw shell/library usage

When adding a helper-backed skill:

1. Add the bundled skill under `skills/<name>/`.
2. Add helper code under `src/helpers/<name>/`.
3. Re-export it from:
   - `src/helpers/index.ts`
   - `src/index.ts`
4. Add the registry entry with `helperProject` if the skill should prepare `.max/temp/`.
5. Add tests for both the helper code and the bundled skill docs/runtime behavior.

## Helper Code Conventions

Helper code should:

- live under `src/helpers/<skill-name>/`
- expose a small, stable public API
- keep agent-facing abstractions high level
- hide repetitive provider or adapter setup when that reduces friction
- return explicit typed results
- stay aligned with the bundled skill docs

Prefer one helper directory per skill or capability family.

## What Goes In Docs vs Code

Put this in helper code:

- stable reusable abstractions
- provider wiring
- default adapter setup
- runtime validation
- output shaping

Put this in skill docs:

- when to use the helper
- which function to call
- exact helper signatures and behavior notes when the agent needs them to use the helper correctly
- which reference file to read next
- task-specific request patterns
- model-specific options and examples

Keep exact API references in `references/` rather than duplicating them inside `SKILL.md`.

## Temp Workspace Behavior

If a skill includes `helperProject`, `addSkill()` prepares `.max/temp/` as a reusable TypeScript
workspace.

That workspace is for one-off helper scripts and should be treated as agent runtime state, not as a
normal project folder.

Skill docs do not need to explain how `.max/temp/` is prepared; that behavior belongs in the system
prompt and package docs.

## Monorepo Skill Testing

When iterating on a bundled skill inside this package, prefer the monorepo-local tester flow:

```bash
pnpm --filter @ank1015/llm-agents skill:tester -- <skill-name>
```

That workflow installs the requested skill into `packages/agents/.skill-tester/skills/` and reuses
`packages/agents/.skill-tester/temp/` for helper-backed scripts, while keeping the real bundled
skill and helper source under `skills/` and `src/helpers/`.

For quick non-interactive checks, pass a prompt directly:

```bash
pnpm --filter @ank1015/llm-agents skill:tester -- <skill-name> --prompt "Inspect the installed skill and summarize how it is meant to be used."
```

In one-shot mode, the tester runs the prompt once, waits for the agent to finish, saves the full
conversation transcript, prints the final agent response, and exits.

Saved tester transcripts are written under `packages/agents/.sessions/skill-tester/`, which makes
it easy to inspect how the agent used the installed skill and helper-backed temp workspace after the
run completes.
