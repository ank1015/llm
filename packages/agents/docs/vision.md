# `@ank1015/llm-agents` Vision

## Purpose

`@ank1015/llm-agents` is the home of the general-purpose agent used by this monorepo.

This package is intentionally opinionated and Node-oriented. It is the layer that turns the lower
level LLM packages into a practical agent that can work on real tasks across the machine.

At its core, the agent is not just a code-writing assistant. It is a general-purpose execution
agent with access to:

- filesystem exploration tools such as `ls`, `find`, and `grep`
- file reading with `read`
- file modification with `edit` and `write`
- arbitrary command execution with `bash`

Because the agent can execute commands, it is not limited to producing code or text. It can also
run programs, inspect outputs, and use the machine as part of getting work done.

## Core Thesis

The package should be structured around a simple idea:

- the base agent is broad and general-purpose
- specialized capability is added through skills
- skills are loaded only when needed

The base agent should know how to use its core tools and how to discover and load relevant skills.
It should not carry every specialized workflow in its default prompt or internal logic.

This keeps the base agent compact while still allowing it to become highly capable when a task
needs extra domain knowledge.

## Skills

A skill is a specialized package of instructions and optional assets that teaches the agent how to
use a library, command, application, workflow, or package to accomplish a class of tasks.

Skills are intentionally not loaded into the system prompt up front. Instead, the agent receives
only:

- the skill name
- a short description
- the path to the skill

When a task matches a skill, the agent reads the skill on demand and follows it.

This keeps prompt size under control and makes specialization composable.

## Two Kinds of Skills

The package should support two valid skill styles.

### 1. Documentation-only skills

These skills primarily teach process:

- how to use a third-party library
- how to use a CLI or application
- how to structure work in a specific domain

They may include scripts, references, templates, or examples, but they do not require the agents
package to export new runtime helpers.

### 2. Helper-backed skills

Some skills benefit from package-level helper APIs. In those cases:

- the skill teaches the agent when and how to use the helper
- `@ank1015/llm-agents` exports the helper
- the helper provides a stable, reusable abstraction over lower-level packages

Examples:

- an `image` skill can teach the agent how to import and use `createImage()` or `editImage()`
- a `browser-use` skill can teach the agent how to use higher-level browser helpers exposed by
  this package
- future skills may wrap PDF, office-document, or other domain-specific workflows

This allows the package to remain the public home of agent-oriented abstractions without pushing
those abstractions down into generic packages like `sdk` or `extension`.

## Relationship Between Tools and Skills

The core tools are always available. Skills do not replace them.

The tools make the agent generally capable:

- inspect files
- edit files
- execute commands
- work in temporary directories

Skills improve how the agent solves specialized tasks:

- they teach best practices
- they point the agent to existing scripts or assets
- they explain when to use helper exports instead of reinventing work

Because the agent has `bash`, it can always fall back to direct execution. Helper-backed skills are
there to improve reliability, ergonomics, and reuse rather than to gate basic capability.

## Package Responsibilities

This package should own:

- the general-purpose agent tool layer
- system prompt construction for the general-purpose agent
- skill discovery, installation, and packaging
- bundled skill content under `skills/`
- exported helper APIs that exist specifically to support skills
- optional thin CLI entrypoints for local testing or temporary in-memory sessions

This package should not try to become a lower-level SDK. Generic LLM primitives belong in `core`
and `sdk`. Browser transport belongs in `extension`. Concrete persistence adapters belong in
`sdk-adapters`.

`@ank1015/llm-agents` is the opinionated, task-facing layer on top of those packages.

## Runtime Model

The default runtime should assume Node.js and local machine access.

This package is expected to work naturally with:

- filesystem tools
- shell execution
- installed local applications
- temporary working directories under agent-managed state

When a task needs code to be written and run, the agent should generally prefer using its own temp
workspace under `.max/temp` unless the user explicitly wants code added directly to the project.

If a project needs to import and use `@ank1015/llm-agents` directly, that can be done deliberately.
But the normal agent workflow should not require modifying the user project just to use a skill.

## Design Principles

- Keep the base agent broad, simple, and dependable.
- Keep specialization lazy and skill-driven.
- Prefer stable helper exports for repeated specialized workflows.
- Keep lower-level packages generic and push agent-specific abstractions up into this package.
- Use the package as the public home for skill-oriented helper APIs.
- Treat bundled skills as first-class package assets, not just loose markdown files.

## What This Means for Future Refactors

Future cleanup should align the package with this thesis:

- tools, prompt logic, skill management, and helper exports should form the real public surface
- stale tests, docs, and registry entries should be brought back in line with the actual bundled
  skills and exported helpers
- helper-backed skills should have clear ownership between:
  - bundled skill content
  - exported helper API
  - tests
  - package metadata

That alignment is the key to making `@ank1015/llm-agents` coherent as the long-term home of the
general-purpose agent.
