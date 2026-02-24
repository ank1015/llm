# Orchestration Server — Implementation Status

## What's Done

### Core SDK Layer (`src/core/`)

**Config** (`core/config.ts`)

- `getConfig()` / `setConfig()` — app-level path configuration
- Defaults: `projectsRoot = ~/projects`, `dataRoot = ~/.llm/projects`

**Types** (`core/types.ts`)

- `ProjectMetadata` — id, name, description, projectPath, createdAt
- `ArtifactDirMetadata` — id, name, description, createdAt
- `SessionMetadata` — id, name, api, modelId, createdAt
- `CreateProjectInput`, `CreateArtifactDirInput`, `CreateSessionOptions`, `PromptInput`

**Storage Utilities** (`core/storage/fs.ts`)

- `ensureDir`, `pathExists`, `removeDir`, `getStats` — directory operations
- `readJson`, `writeJson` — generic JSON file I/O
- `readMetadata`, `writeMetadata` — convenience wrappers for metadata.json convention
- `listDirs`, `listFiles` — directory listing with filtering
- `METADATA_FILE` constant

**Project** (`core/project/project.ts`)

- `Project.create(input)` — creates both working and data directories, writes metadata
- `Project.list()` — scans data root for projects with valid metadata
- `Project.getById(id)` — loads existing project from metadata
- `project.getMetadata()` / `project.exists()` / `project.delete()`
- Name → slug conversion for directory names

**ArtifactDir** (`core/artifact-dir/artifact-dir.ts`)

- `ArtifactDir.create(projectId, input)` — creates working + data dirs within a project
- `ArtifactDir.list(projectId)` — lists artifact dirs in a project
- `ArtifactDir.getById(projectId, dirId)` — loads existing artifact dir
- `dir.getMetadata()` / `dir.listArtifacts()` / `dir.exists()` / `dir.delete()`

**Session** (`core/session/session.ts`)

- `Session.create(projectId, artifactDirId, options)` — creates session via SDK SessionManager + writes our own metadata.json
- `Session.getById(projectId, artifactDirId, sessionId)` — loads session, reconstructs api/modelId from metadata
- `Session.list(projectId, artifactDirId)` — lists sessions via SessionManager
- `session.prompt(input)` — full prompt flow: load history → Conversation → LLM call → save messages
- `session.getHistory()` — returns full message history
- `session.getMetadata()` — returns session config
- Uses `FileSessionsAdapter` for JSONL persistence
- Uses `FileKeysAdapter` for API credential resolution
- Uses `Conversation` class for runtime LLM interaction

### Routes Layer (`src/routes/`)

All routes mounted under `/api` prefix on the Hono app.

**Project Routes** — `POST/GET/DELETE /api/projects[/:projectId]`
**Artifact Dir Routes** — `POST/GET/DELETE /api/projects/:projectId/artifacts[/:artifactDirId]` + `/files` endpoint
**Session Routes** — `POST/GET /api/.../sessions[/:sessionId]` + `/messages` and `/prompt` endpoints

All routes include input validation (400), not-found handling (404), and conflict handling (409).

### Tests (`tests/`)

**73 tests total, all passing.**

Unit tests:

- `tests/project.test.ts` — 13 tests
- `tests/artifact-dir.test.ts` — 15 tests
- `tests/session.test.ts` — 11 tests (Conversation + getModel mocked)

Route integration tests:

- `tests/routes/projects.test.ts` — 9 tests
- `tests/routes/artifact-dirs.test.ts` — 12 tests
- `tests/routes/sessions.test.ts` — 12 tests (Conversation + getModel mocked)

Existing:

- `tests/health.test.ts` — 1 test

All tests use temp directories (`mkdtemp`) and clean up after themselves.

---

## What's Left

### 1. Tools (High Priority)

Sessions currently have **no tools**. The `Conversation` class supports `setTools()` but we haven't wired it up. This is the most impactful missing piece — without tools, session agents can only respond with text, they can't read/write files, run commands, or interact with the filesystem.

**What needs to happen:**

- Define built-in tools: file read, file write, file find/glob, bash execution
- **Write scoping**: tools in a session should only allow writes to the session's artifact directory (`~/projects/{projectId}/{artifactDirId}/`)
- **Read scoping**: tools should allow reads across the entire project directory (`~/projects/{projectId}/`)
- Create a tool registry or factory that produces scoped tools for a given session
- Wire tools into `Session.prompt()` via `conversation.setTools()`
- The tool definitions must follow the `AgentTool` interface from `@ank1015/llm-sdk` (name, description, parameters as TypeBox schema, execute function)

**Key files to modify:**

- `src/core/session/session.ts` — wire tools into the Conversation in `prompt()`
- New: `src/core/tools/` directory — tool definitions and registry

### 2. System Prompt (High Priority)

Sessions currently have **no system prompt**. The `Conversation` class supports `setSystemPrompt()` but it's not configured.

**What needs to happen:**

- Define a base system prompt that tells the agent about its environment: what project it's in, what artifact directory it writes to, what other artifact dirs exist for reading
- Optionally allow custom system prompts per session (could be stored in session metadata or passed at creation)
- Wire into `Session.prompt()` via `conversation.setSystemPrompt()`

**Key files to modify:**

- `src/core/session/session.ts` — set system prompt in `prompt()`
- `src/core/types.ts` — possibly add `systemPrompt` field to `CreateSessionOptions` and `SessionMetadata`

### 3. Custom Skills per Session (Medium Priority)

The design envisions sessions having **specialized skills** — for example, a research session might have web search tools, while a code session has bash and file tools. This is the mechanism for making different sessions good at different things.

**What needs to happen:**

- Define a skill/tool configuration system — either predefined skill sets or per-session tool configuration at creation time
- Store skill configuration in session metadata
- Load the right tools based on session's skill config when creating the Conversation

### 4. Streaming Support (Medium Priority)

Currently `session.prompt()` uses `streamAssistantMessage: false` — it waits for the full response before returning. For a better UX (especially in a web frontend), streaming would allow progressive response delivery.

**What needs to happen:**

- Add a streaming prompt endpoint (SSE or WebSocket)
- Use `streamAssistantMessage: true` in the Conversation
- Subscribe to Conversation events and stream them to the client

### 5. Active Session State / Caching (Low Priority)

Currently each `prompt()` call creates a fresh `Conversation` instance and reloads the full message history from disk. This works but is inefficient for active sessions with long histories.

**What could be done:**

- Keep active Conversation instances in memory (keyed by sessionId)
- Invalidate/cleanup on session close or timeout
- This is a performance optimization, not a correctness issue

### 6. Error Handling Improvements (Low Priority)

Current error handling is basic — catch/rethrow with string messages. Could be improved with:

- Custom error classes (NotFoundError, ConflictError, ValidationError)
- Consistent error response format across all routes
- Better error messages with context

---

## File Structure Reference

```
packages/server/
├── docs/
│   ├── DESIGN.md              ← This design document
│   └── STATUS.md              ← This status document
├── src/
│   ├── core/
│   │   ├── index.ts           ← Public exports
│   │   ├── config.ts          ← App config (projectsRoot, dataRoot)
│   │   ├── types.ts           ← All type definitions
│   │   ├── storage/
│   │   │   └── fs.ts          ← Filesystem helpers
│   │   ├── project/
│   │   │   └── project.ts     ← Project class
│   │   ├── artifact-dir/
│   │   │   └── artifact-dir.ts ← ArtifactDir class
│   │   └── session/
│   │       └── session.ts     ← Session class
│   ├── routes/
│   │   ├── projects.ts
│   │   ├── artifact-dirs.ts
│   │   └── sessions.ts
│   ├── index.ts               ← Hono app, mount routes
│   └── server.ts              ← HTTP entry point
├── tests/
│   ├── health.test.ts
│   ├── project.test.ts
│   ├── artifact-dir.test.ts
│   ├── session.test.ts
│   └── routes/
│       ├── projects.test.ts
│       ├── artifact-dirs.test.ts
│       └── sessions.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```
