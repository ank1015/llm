# Architecture

## Core Model

The server manages three nested concepts:

- `Project` — top-level working area
- `ArtifactDir` — a scoped directory inside a project
- `Session` — an LLM-backed agent conversation attached to one artifact directory

Each project has two root paths:

- working path: agent-visible files under `projectsRoot`
- metadata path: hidden server state under `dataRoot`

Example:

```text
~/projects/my-project/                 # agent-visible workspace
├── research/
├── app/
└── assets/

~/.llm/projects/my-project/            # hidden metadata and session state
├── metadata.json
└── artifacts/
    ├── research/
    │   ├── metadata.json
    │   └── sessions/
    └── app/
```

## Session Runtime

`Session` is the package’s core runtime object.

For each turn it:

1. Loads the persisted message path from file-backed session storage
2. Builds the current system prompt with `@ank1015/llm-agents`
3. Creates the current tool set with `@ank1015/llm-agents`
4. Resolves provider options from the selected API and reasoning level
5. Runs a `Conversation` from `@ank1015/llm-sdk`
6. Persists new message nodes back into the session tree

The runtime supports:

- non-streaming prompts
- streaming prompts
- message tree inspection
- retry from a prior user message
- edit from a prior user message
- active branch tracking

## Skills

Bundled skills come from `@ank1015/llm-agents`.

The server exposes:

- bundled-skill discovery at `/api/skills`
- artifact-local install/list/delete under artifact routes

Installed skills live inside the artifact’s `.max/skills` directory. Helper-backed skills may also prepare `.max/temp`.

## SSE Run Registry

Streaming turns are tracked by an in-memory run registry.

Each run has:

- a `runId`
- `mode`: `prompt`, `retry`, or `edit`
- `status`: `running`, `completed`, `failed`, or `cancelled`
- a replay buffer of SSE events

Clients can:

- start a live stream
- reconnect to an existing stream by `runId`
- replay from a prior sequence number
- cancel an active run

SSE events emitted by the server are:

- `ready`
- `agent_event`
- `node_persisted`
- `done`
- `error`

## Internal Helpers

`credential-utils.ts` provides internal support for reloadable credentials for:

- `codex`
- `claude-code`

This file is part of the server’s internal runtime and test surface, not part of the root package API.
