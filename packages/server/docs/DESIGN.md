# Orchestration Server — Design Document

## The Problem

When working on a project, the work spans far beyond just code. There's research, analysis, asset generation, marketing, and more. Each of these tasks is often handled by different agents on different platforms — a coding agent for implementation, a research agent for deep analysis, a design agent for assets, etc.

The core problem is **continuity of information across different tasks and agents**.

Examples:

- Research done on one platform needs to be carried to a coding agent for implementation.
- A coding agent produces a theme/design system that an asset generation agent needs to understand.
- Marketing analysis done elsewhere needs to inform decisions in the codebase.
- Multiple codebases within the same project need to share context.

The friction of manually moving context between agents, sessions, and platforms slows everything down.

## The Solution

A **shared workspace system** where different agents can read and write structured information (artifacts) within a project directory. The user acts as the orchestrator — directing which agents work on what, pointing them to the right artifacts, and controlling the flow.

Think of it like an organization: researchers write documents, developers read them and write code, designers read the code and produce assets. The shared drive is the project directory. The manager (user) assigns tasks and routes context.

### Key Principles

1. **Agent-agnostic** — Any agent that can read/write files can participate. The system doesn't care what platform or model produces the artifact.
2. **User-orchestrated** — The user is in full control. They decide what to work on, which artifacts to reference, and when to switch contexts. This is not an autonomous multi-agent system.
3. **File-system as the universal interface** — Every agent can read and write files. It's the lowest common denominator that works across all platforms.
4. **Artifacts as the unit of shared knowledge** — Every piece of information produced during work is an artifact. Research findings, code, generated images, analysis documents — all artifacts.

## Architecture

### Hierarchy

```
Project
├── Artifact Directory ("research")
│   ├── Session 1 (conversation with research agent)
│   ├── Session 2 (another research conversation)
│   └── [artifact files produced by sessions]
├── Artifact Directory ("app")
│   ├── Session 1 (coding session)
│   └── [code, configs, etc.]
└── Artifact Directory ("assets")
    ├── Session 1 (asset generation session)
    └── [images, icons, etc.]
```

**Project** — Top-level container. Associated with a directory on disk. Contains everything about the project.

**Artifact Directory** — A categorized subdirectory within a project. Each directory represents a domain of work (research, code, assets, etc.). Agents write their output here.

**Session** — A conversation with an agent within an artifact directory. Each session can **write only to its own artifact directory** but can **read from any artifact directory** in the project. This enforces clean boundaries while allowing cross-domain context sharing.

### Two-Path Separation

A critical design decision: the **working directory** (where agents operate and artifacts live) is separated from the **metadata directory** (where system data lives).

```
~/projects/{project-id}/                    ← Working directory (agents see this)
├── research/                               ← Artifact dir working path
│   ├── findings.md                         ← Actual artifacts
│   └── competitor-analysis.json
├── app/
│   └── src/...
└── assets/
    └── logo.png

~/.llm/projects/{project-id}/              ← Metadata directory (invisible to agents)
├── metadata.json                           ← Project metadata
├── artifacts/
│   ├── research/
│   │   └── metadata.json                   ← Artifact dir metadata
│   └── app/
│       └── metadata.json
│       └── sessions/
│           ├── meta/{session-id}/
│           │   └── metadata.json           ← Session config (api, model, etc.)
│           └── {project-id}/
│               └── {session-id}.jsonl      ← Conversation history
```

**Why separate?** Agents working in the project directory should see a clean workspace — just their artifacts and files. They shouldn't encounter metadata.json files, session logs, or system configuration. The metadata path keeps all system concerns invisible.

### Session Integration

Sessions use the existing SDK packages:

- **`Conversation` class** (from `@ank1015/llm-sdk`) — Manages the runtime agent loop. Holds messages in memory, executes tools, handles LLM calls.
- **`SessionManager` + `FileSessionsAdapter`** (from `@ank1015/llm-sdk` and `@ank1015/llm-sdk-adapters`) — Persists conversation history as JSONL files. Append-only, supports branching.
- **`FileKeysAdapter`** (from `@ank1015/llm-sdk-adapters`) — Resolves API credentials from `~/.llm/keys/`.

**Prompt flow:**

1. User sends a message via API
2. Server loads message history from JSONL file via SessionManager
3. Creates a fresh Conversation instance, populates with history
4. Calls `conversation.prompt()` — this runs the full agent loop (LLM call → tool execution → repeat)
5. Saves all new messages back to the JSONL file
6. Returns new messages to the caller

### Configuration

App-level config with sensible defaults:

```typescript
{
  projectsRoot: '~/projects',       // Where project working directories live
  dataRoot: '~/.llm/projects',      // Where project metadata lives
}
```

Set once at server startup. All core classes read from config internally — no need to pass paths around.

## Implementation Structure

```
packages/server/src/
├── core/                           # SDK — pure logic, no HTTP
│   ├── index.ts                    # Public exports
│   ├── config.ts                   # App configuration (paths)
│   ├── types.ts                    # All type definitions
│   ├── storage/
│   │   └── fs.ts                   # Filesystem helpers (readJson, writeJson, etc.)
│   ├── project/
│   │   └── project.ts              # Project class
│   ├── artifact-dir/
│   │   └── artifact-dir.ts         # ArtifactDir class
│   └── session/
│       └── session.ts              # Session class
├── routes/                         # Thin HTTP layer — maps requests to core
│   ├── projects.ts
│   ├── artifact-dirs.ts
│   └── sessions.ts
├── index.ts                        # Hono app, mount routes
└── server.ts                       # HTTP entry point
```

**Core** knows nothing about HTTP. Exports classes that take plain arguments and return plain data.

**Routes** is a thin translation layer. Parse request → call core function → return response.

## API Surface

### Projects

- `POST   /api/projects` — Create project
- `GET    /api/projects` — List projects
- `GET    /api/projects/:projectId` — Get project
- `DELETE /api/projects/:projectId` — Delete project

### Artifact Directories

- `POST   /api/projects/:projectId/artifacts` — Create artifact dir
- `GET    /api/projects/:projectId/artifacts` — List artifact dirs
- `GET    /api/projects/:projectId/artifacts/:artifactDirId` — Get artifact dir
- `GET    /api/projects/:projectId/artifacts/:artifactDirId/files` — List artifact files
- `DELETE /api/projects/:projectId/artifacts/:artifactDirId` — Delete artifact dir

### Sessions

- `POST   /api/.../sessions` — Create session (requires `api` and `modelId`)
- `GET    /api/.../sessions` — List sessions
- `GET    /api/.../sessions/:sessionId` — Get session metadata
- `GET    /api/.../sessions/:sessionId/messages` — Get message history
- `POST   /api/.../sessions/:sessionId/prompt` — Send a message and get response
