# Skill Authoring Guide

This guide explains how to create a new skill for the `packages/agents` package in this repo.

It is intentionally opinionated. The goal is not just to produce a valid skill folder, but to produce a skill that:

- triggers reliably
- gives the agent the right amount of freedom
- works with this repo's `max-skills` runtime model
- avoids the mistakes we already found while building `xlsx` and `pptx`

This guide is the repo-specific companion to the general skill design principles from `skill-creator`.

## What a skill is in this repo

A skill is a folder under [packages/agents/skills](/Users/notacoder/Desktop/agents/llm/packages/agents/skills).

Each skill is copied into a generated project workspace at:

```text
<projectDir>/max-skills/skills/<skill-name>/
```

The generated workspace is created by [index.ts](/Users/notacoder/Desktop/agents/llm/packages/agents/src/agents/skills/index.ts).

At runtime:

- `setupSkills(projectDir)` copies every folder from `packages/agents/skills/` into `projectDir/max-skills/skills/`
- it builds `registry.json` from each skill's `SKILL.md`
- the system prompt reads that registry and exposes each skill as:
  - `name`
  - `description`
  - `path`

The system prompt is built in [system-prompt.ts](/Users/notacoder/Desktop/agents/llm/packages/agents/src/agents/system-prompt.ts).

That means the skill source of truth is always the repo copy under `packages/agents/skills/`, not the generated copy under `max-skills/skills/`.

## The loading model

Skills are loaded progressively:

1. `name` and `description` are always visible through the registry.
2. `SKILL.md` is read only when the agent decides the skill is relevant.
3. Additional files under `scripts/`, `references/`, or `assets/` are read or executed only when needed.

Because of this, the most important part of a skill is its frontmatter description. If the description is weak, the skill will not trigger when it should.

## Where to put a new skill

Create a new folder here:

```text
packages/agents/skills/<skill-name>/
```

Recommended shape:

```text
packages/agents/skills/
  <skill-name>/
    SKILL.md
    agents/
      openai.yaml                # optional
    scripts/                     # optional
    references/                  # optional
    assets/                      # optional
```

Notes:

- `SKILL.md` is required.
- `agents/openai.yaml` is optional. It is not currently used by `setupSkills()` or registry generation, but it is a reasonable place for future UI metadata.
- Only create folders you actually need.
- Do not create auxiliary files like `README.md`, `NOTES.md`, or `CHANGELOG.md` inside the skill folder.

## Naming rules

Use simple, stable names:

- folder name should match the skill name
- use lowercase letters, digits, and hyphens only when possible
- keep it short and obvious
- prefer names that describe the primary file format, tool, or workflow

Examples:

- `xlsx`
- `pptx`
- `sdk-debugger`
- `extension-manifest`

## The required `SKILL.md` contract

Every skill must have YAML frontmatter with:

- `name`
- `description`

Example:

```md
---
name: sdk-debugger
description: Use this skill when the user is debugging code that uses the local SDK packages, especially when the task involves adapters, transport boundaries, request/response shapes, or tracing behavior across @ank1015/llm-sdk, @ank1015/llm-sdk-adapters, @ank1015/llm-core, or @ank1015/llm-types.
---
```

Important repo-specific constraint:

- Keep `name` and `description` on single lines.
- The current registry parser in [index.ts](/Users/notacoder/Desktop/agents/llm/packages/agents/src/agents/skills/index.ts) only extracts simple single-line `name:` and `description:` values.
- Quoted strings are fine.
- Multi-line YAML values, nested frontmatter objects, or fancy YAML features are not guaranteed to parse correctly for registry generation.

Only `name` and `description` matter to the current runtime. Extra frontmatter fields are not used by the registry.

## Writing a good description

The description is the trigger. Write it like matching logic, not marketing copy.

A strong description should answer:

- what the skill does
- what files, tools, or domains it applies to
- what user requests should trigger it
- what near-misses should not trigger it

Good pattern:

```text
Use this skill any time ...
This includes ...
Trigger especially when ...
Do not trigger when ...
```

What to include:

- file extensions if relevant
- common user words they might use casually
- related tasks, not just one exact workflow
- exclusions when nearby tasks should use a different skill

What to avoid:

- vague descriptions like "Helps with presentations"
- body-only trigger instructions
- descriptions that only mention one narrow example
- descriptions that describe the implementation instead of the user intent

## Writing the body of `SKILL.md`

The body should help the agent execute the task after the skill is selected.

Keep the body concise and practical. The agent is already smart. The body should add:

- workflow
- path conventions
- tooling conventions
- reliability constraints
- repo-specific gotchas

Good things to put in the body:

- quick reference table
- exact script paths
- when to read extra reference files
- required verification steps
- environment assumptions
- specific import quirks or tool limitations

Bad things to put in the body:

- long theory explanations
- generic background the model already knows
- duplicate copies of package docs
- trigger logic that belongs in frontmatter

## Repo-specific runtime conventions

These are specific to this repo and should be reflected in new skills when relevant.

### 1. Skills are copied into `max-skills`

The source skill lives in the repo:

```text
packages/agents/skills/<skill-name>/
```

The generated runtime copy lives here:

```text
<projectDir>/max-skills/skills/<skill-name>/
```

When writing instructions, prefer paths that make sense from the `max-skills` root. For bundled scripts, that usually means:

```text
skills/<skill-name>/scripts/...
```

Example:

```bash
python skills/xlsx/scripts/recalc.py output.xlsx
```

### 2. Helper scripts belong in `max-skills/scripts/<artifact-name>/`

If the skill expects the agent to create helper scripts or intermediate files, tell it to use:

```text
<projectDir>/max-skills/scripts/<artifact-name>/
```

And temp files should usually go in:

```text
<projectDir>/max-skills/scripts/<artifact-name>/tmp/
```

Final user-facing deliverables should go in the artifact directory, not in `max-skills`.

Example split:

- source skill code: `skills/pptx/scripts/...`
- generated helper script: `scripts/product/create-sales-ppt.ts`
- generated temp outputs: `scripts/product/tmp/...`
- final deliverable: `<artifactDir>/product-sales-presentation.pptx`

### 3. `max-skills` is a pnpm + TypeScript + ESM workspace

The generated workspace:

- uses `pnpm`
- uses ESM
- supports TypeScript helper scripts
- is intended to be the default place for skill-driven code execution

If your skill expects agent-authored JS or TS:

- prefer `.ts`
- tell the agent to run scripts with `pnpm exec tsx <file>`
- tell the agent to use ESM `import`
- tell the agent not to use CommonJS `require(...)` unless intentionally creating `.cjs`
- tell the agent to use `pnpm`, not `npm`, for JS dependency installs in `max-skills`

### 4. Some npm dependencies are preinstalled globally for skills

The generated workspace currently installs common packages in [index.ts](/Users/notacoder/Desktop/agents/llm/packages/agents/src/agents/skills/index.ts).

At the time of writing, that includes:

- `pptxgenjs`
- `react`
- `react-dom`
- `react-icons`
- `sharp`
- `xlsx`
- `@ank1015/llm-types`
- `@ank1015/llm-sdk`
- `@ank1015/llm-sdk-adapters`
- `@ank1015/llm-extension`

If a new skill depends on a broadly useful npm package that multiple runs are likely to need, add it to `bundledSkillDependencies` in [index.ts](/Users/notacoder/Desktop/agents/llm/packages/agents/src/agents/skills/index.ts).

If a dependency is niche or optional:

- document it in the skill
- tell the agent to install it in `max-skills` with `pnpm` only when needed

### 5. Python and system dependencies are provided globally

If a skill needs Python libraries or system tools, document them explicitly in the skill as global runtime assumptions.

Examples:

- Python packages: `pandas`, `openpyxl`, `python-pptx`, `Pillow`
- system tools: `LibreOffice`, `pdftoppm`

For this repo's bundled skills, required Python libraries and system tools are expected to be installed and available globally.

When authoring a skill:

- say that the dependency can be assumed to be available globally
- do not write user-facing install steps for required Python or system dependencies
- if a new skill introduces a new required global dependency, make sure the environment is updated to provide it before relying on that skill

## When to add `scripts/`, `references/`, and `assets/`

### Add `scripts/` when reliability matters

Use bundled scripts when:

- the same code would otherwise be rewritten repeatedly
- the operation is fragile
- execution should be deterministic
- the script is useful without loading all of its code into the model context

Examples:

- OOXML unpack/pack helpers
- validation utilities
- format conversion helpers
- deterministic data cleanup utilities

### Add `references/` when the body would get too large

Use references when:

- the skill needs substantial domain knowledge
- there are multiple variants or subdomains
- the main `SKILL.md` would become bloated

Keep `SKILL.md` as the routing layer:

- explain when to read each reference
- link directly from `SKILL.md`
- avoid deep chains of references

### Add `assets/` when files are used in outputs

Use assets for:

- templates
- sample boilerplate
- logos
- fonts
- icons
- fixture files that are copied or modified

Do not use `assets/` for documentation.

## What to encode directly in the skill

Any repeated failure or subtle runtime detail should be documented in the skill itself.

Examples from our own work:

- exact `pptxgenjs` import and constructor pattern in this workspace
- using PptxGenJS built-in charts before adding heavier chart-rendering packages
- using `skills/<skill-name>/scripts/...` paths from the `max-skills` root
- telling the agent not to use `read` directly on binary files like `.xlsx` or `.pptx`

If the agent had to debug a quirk once, that is a strong sign the skill should say it explicitly.

## Binary file guidance

If a skill works with binary formats, state clearly how the agent should inspect them.

Do not let the skill imply that the agent should use plain text file reads on binary artifacts.

Instead, instruct the agent to use:

- a library
- a bundled script
- a converter
- a validation or extraction command

Examples:

- use `pandas` or `openpyxl` for `.xlsx`
- use `markitdown`, `thumbnail.py`, or OOXML unpackers for `.pptx`

## How much freedom to give the agent

Use guardrails where the workflow is fragile.

High freedom is fine when:

- several approaches are acceptable
- the task is mostly reasoning
- the tools are forgiving

Low freedom is better when:

- one exact path is known to work
- a wrong path is expensive or slow
- environment/tooling quirks matter
- the agent should avoid dependency churn

In this repo, format and tool-integration skills often benefit from medium-to-low freedom.

Examples:

- good: "Write helper scripts under `scripts/<artifact-name>/` and run them with `pnpm exec tsx`."
- too loose: "Write scripts wherever convenient and run them however you want."

## Common mistakes to avoid

### 1. Weak triggering descriptions

If the description is not specific enough, the skill will be ignored.

### 2. Putting trigger logic only in the body

The body is only read after the skill triggers. Put trigger rules in `description`.

### 3. Referencing the wrong paths

Remember the runtime copy is under `max-skills`.

For bundled scripts, use paths like:

```text
skills/<skill-name>/scripts/...
```

For generated helper scripts, use:

```text
scripts/<artifact-name>/...
```

### 4. Forgetting the artifact/temp/output split

Use this model:

- bundled skill resources: `skills/<skill-name>/...`
- generated helper code: `scripts/<artifact-name>/...`
- temp/intermediate outputs: `scripts/<artifact-name>/tmp/...`
- final user-facing outputs: artifact directory

### 5. Requiring `npm` in `max-skills`

The workspace is `pnpm`-based. Skills should say `pnpm`.

### 6. Using CommonJS examples in an ESM workspace

If the skill expects TS/JS execution in `max-skills`, use ESM examples.

### 7. Letting the skill bloat

Do not dump large docs into `SKILL.md`. Split into references.

### 8. Forgetting environment dependencies

If a skill depends on a system binary or Python library, say so as a global runtime assumption.

### 9. Shipping generated junk

Because `setupSkills()` copies the entire skill folder recursively, do not keep generated trash in the source skill.

Avoid committing:

- `__pycache__/`
- `.pyc`
- output files
- screenshots from local runs
- temporary PDFs
- rendered previews
- local test artifacts

Keep the source skill clean.

## Recommended authoring workflow

### 1. Define the trigger cases first

Before writing files, answer:

- what user requests should trigger this skill?
- what filenames or formats are involved?
- what should not trigger it?

Write 3-5 concrete example prompts.

### 2. Decide what belongs in the skill

For each example, decide whether you need:

- only `SKILL.md`
- `SKILL.md` + bundled scripts
- `SKILL.md` + references
- `SKILL.md` + assets

### 3. Create the folder

Add:

```text
packages/agents/skills/<skill-name>/SKILL.md
```

Then only add optional folders as needed.

### 4. Write the frontmatter and body

Start with:

- precise `name`
- strong, trigger-oriented `description`
- short body with quick reference and workflow

### 5. Add runtime conventions

If the skill uses helper scripts or bundled scripts, state:

- where generated scripts go
- where temp files go
- where final outputs go
- how to run JS/TS in `max-skills`

### 6. Add dependencies and quirks

Document:

- preinstalled npm deps the skill can rely on
- globally available Python/system deps the environment must provide
- known import or runtime quirks

### 7. Validate the source structure

At a minimum, manually check:

- folder name matches skill name
- `SKILL.md` exists
- frontmatter has single-line `name` and `description`
- any script paths in the body are correct from the `max-skills` root

### 8. Test end to end

For a real check, test the actual runtime path:

1. run `setupSkills(projectDir)`
2. verify the skill is copied to `projectDir/max-skills/skills/<skill-name>/`
3. verify `registry.json` contains the skill
4. start the agent CLI
5. ask for a task that should trigger the skill
6. inspect the transcript to confirm:
   - the agent read the skill
   - it followed the intended workflow
   - it used the correct directories
   - it avoided the wrong dependency/runtime paths

### 9. Iterate after the first real run

The first real run will expose what the skill failed to say clearly.

Update the skill when you notice:

- wrong dependency choice
- wrong script location
- wrong output location
- unnecessary debugging
- import quirks
- repeated mistakes

That is not a sign the skill failed. That is how a skill gets good.

## A strong starter template

Use this as a baseline for a new skill:

```md
---
name: my-skill
description: Use this skill when the user needs to work with ...
---

# My Skill

## Quick Reference

| Task             | Action |
| ---------------- | ------ |
| Primary workflow | `...`  |
| Validation       | `...`  |

## Runtime Conventions

- Bundled scripts live under `skills/my-skill/scripts/...` when working from the `max-skills` root.
- If Max writes helper scripts or intermediate files, Max should use `max-skills/scripts/<artifact-name>/`.
- Temporary files should go in `max-skills/scripts/<artifact-name>/tmp/`.
- Final user-facing outputs should go in the artifact directory unless the user says otherwise.

## Runtime Assumptions

- `...`

## Workflow

1. Read ...
2. Run ...
3. Verify ...

## Extra Guides

- For advanced case A, read [references/case-a.md](references/case-a.md)
- For advanced case B, read [references/case-b.md](references/case-b.md)
```

## Final checklist

Before considering a new skill complete, check all of these:

- The skill lives under `packages/agents/skills/<skill-name>/`
- `SKILL.md` exists
- `name` and `description` are present and single-line
- the description clearly defines when to use the skill
- the body is concise and operational
- script paths are written relative to the `max-skills` root where appropriate
- artifact script and temp directory conventions are explicit when needed
- final output location is explicit when needed
- JS/TS runtime instructions use `pnpm`, `tsx`, and ESM when relevant
- global Python/system runtime assumptions are documented if needed
- repeated quirks are encoded directly in the skill
- no generated junk is left in the source skill folder
- the skill was tested through `setupSkills()` and a real agent run

## Current examples

Use the existing skills as examples of the current style and runtime assumptions:

- [pptx](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/pptx/SKILL.md)
- [xlsx](/Users/notacoder/Desktop/agents/llm/packages/agents/skills/xlsx/SKILL.md)

Also refer to the implementation that consumes these skills:

- [index.ts](/Users/notacoder/Desktop/agents/llm/packages/agents/src/agents/skills/index.ts)
- [system-prompt.ts](/Users/notacoder/Desktop/agents/llm/packages/agents/src/agents/system-prompt.ts)
