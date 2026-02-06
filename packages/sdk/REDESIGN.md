---

SDK Redesign: Complete Implementation Guide

1. Current State Summary

The SDK has three layers:

- Adapter interfaces + implementations: KeysAdapter, UsageAdapter, SessionsAdapter with file/sqlite implementations
- LLM functions: complete() and stream() that wrap core with key resolution and usage tracking
- Higher-level classes: Conversation (stateful agent loop) and SessionManager (session CRUD wrapper)

What works well: The adapter interface pattern is clean. The core delegation model is right. The session tree structure with JSONL append-only
storage is solid.

What's broken: There are correctness bugs, security gaps, and the three layers don't compose — the user has to manually wire adapters everywhere, and
Conversation and Sessions are completely independent.

---

2. Behavioral Contracts

These are decisions that must be locked before writing code. Every engineer on the team should know these.

2.1 Usage tracking failure policy

Decision: Configurable, default bestEffort.

Why: Usage tracking is observability, not business logic. If SQLite has a write error, the user's LLM call should still succeed. But some users
(billing-critical apps) need to know if tracking fails.

type UsageTrackingMode = 'strict' | 'bestEffort';

- bestEffort (default): Tracking errors are caught, emitted as a warning event, and swallowed. The LLM response is still returned.
- strict: Tracking errors propagate. If usageAdapter.track() throws, the overall complete()/stream() call throws.

  2.2 Session auto-creation semantics

Decision: Auto-create only when sessionId is omitted. Error when provided but missing.

Why: Currently FileSessionsAdapter.appendMessage (line 294) silently creates a new session when the provided sessionId doesn't match any file. This
masks bugs — if you typo a session ID, you get a completely new session instead of an error. The silent behavior makes data integrity issues
invisible.

sessionId omitted → auto-create new session (convenience)
sessionId provided → must exist, throw SessionNotFoundError if missing

2.3 Persistence timing

Decision: Write each message immediately on append (current style).

Why: The whole point of JSONL append-only storage is that each write is an atomic filesystem operation. If the process crashes mid-turn, you lose at
most the in-flight message, not the whole turn. End-of-turn batching would throw away this crash-safety property.

2.4 Environment portability

Decision: The root @ank1015/llm-sdk import must work in any JS runtime (Node, browser, edge workers, Deno). Node-specific code goes in a separate
package.

Why: Currently, import { Conversation } from '@ank1015/llm-sdk' pulls in better-sqlite3 (native C++ addon), node:fs, and node:crypto via the adapter
exports in index.ts. This breaks any non-Node consumer at install time (native addon compilation fails) even if they never use the Node adapters. The
SDK is the user-facing package — it must be portable.

2.5 Lifecycle event ownership

Decision: The core runAgentLoop owns all lifecycle events (agent_start, turn_start, turn_end, agent_end). SDK's Conversation must not emit them
independently.

Why: Currently both emit them, so listeners receive duplicates. The runner is the authoritative source — it knows when turns actually start/end.
Conversation's manual emissions at lines 513-514 and 572-573 are redundant and incorrect (they emit turn_start before the runner even begins,
creating a phantom turn event).

2.6 Middleware vs hooks

Decision: Middleware pattern ((ctx, next) => Promise<Result>) for the internal LLM call pipeline. Not exposed as public API in Phase 1.

Why: The alternative (named hooks: beforeRequest, afterResult, onError) cannot express retry (calling next() multiple times) or caching
(short-circuiting without calling next()). The middleware pattern is equally simple to implement and strictly more powerful. We start with it
internally (key injection, usage tracking) and expose it publicly only if/when users need custom middleware.

---

3. Target Architecture

3.1 Package structure

@ank1015/llm-sdk (portable — works everywhere)
├── LLMClient Central entry point
├── Conversation Stateful agent (in-memory + optional persistence)
├── Adapter interfaces KeysAdapter, UsageAdapter, SessionsAdapter
├── Typed errors CostLimitError, SessionNotFoundError, etc.
├── Middleware types Internal pipeline types
├── Re-exports from core/types Models, streams, events, messages
└── resolveApiKey utility Shared key resolution

@ank1015/llm-sdk-adapters (Node-specific — requires Node.js)
├── FileKeysAdapter AES-256-GCM encrypted file storage
├── SqliteUsageAdapter SQLite with WAL mode
├── FileSessionsAdapter JSONL append-only files
└── InMemoryKeysAdapter For testing (no deps)
└── InMemoryUsageAdapter For testing (no deps)
└── InMemorySessionsAdapter For testing (no deps)

Why two packages instead of subpath exports: better-sqlite3 is a root dependency in package.json. Subpath exports control what code gets imported at
runtime, but they don't control what gets installed. Running npm install @ank1015/llm-sdk will still compile the native addon even if you never
import the sqlite adapter. A separate package means non-Node consumers never install native deps at all.

Why in-memory adapters live in the adapters package: They have zero deps and could live anywhere, but they're most useful for testing Node adapter
consumers. If a user is in a pure browser context, they'll likely have their own adapter (e.g., IndexedDB). We can move them later if needed.

3.2 LLMClient

The central entry point. Holds adapters, configuration, and provides factory methods. Eliminates the current pattern of passing adapters to every
function call.

LLMClient
├── Configuration
│ ├── keys?: KeysAdapter
│ ├── usage?: UsageAdapter
│ ├── sessions?: SessionsAdapter
│ ├── defaultProvider?: Provider
│ └── usageTrackingMode: 'strict' | 'bestEffort' (default: 'bestEffort')
│
├── LLM Functions (adapters auto-wired)
│ ├── complete(model, context, providerOptions?) → Promise<BaseAssistantMessage>
│ └── stream(model, context, providerOptions?) → Promise<AssistantMessageEventStream>
│
├── Conversation Factory
│ └── createConversation(opts?) → Conversation
│ opts includes optional session: { projectName, sessionName? }
│ or session: { projectName, sessionId } (resume existing)
│
├── Session Queries (delegates to sessions adapter)
│ ├── listSessions(projectName, path?)
│ ├── getSession(projectName, sessionId, path?)
│ ├── searchSessions(projectName, query, path?)
│ └── ...
│
└── Internal Pipeline
└── Middleware chain: [keyResolution, usageTracking]

Why a class and not just functions: The adapters are shared state. Without a client, every call to complete() or stream() needs { keysAdapter,
usageAdapter } passed explicitly. Every Conversation constructor needs them too. The client eliminates this repetition and gives a natural place for
shared config.

Why session queries live here: SessionManager was a pass-through class that added no logic over the adapter. Instead of maintaining a separate class,
LLMClient exposes session query methods directly. If you need raw adapter access, you can use client.sessions (the adapter instance).

3.3 Conversation with optional persistence

Conversation
├── State
│ ├── provider: Provider
│ ├── messages: Message[]
│ ├── tools: AgentTool[]
│ ├── usage: { totalTokens, totalCost, lastInputTokens }
│ ├── systemPrompt?: string
│ ├── costLimit?: number
│ ├── contextLimit?: number
│ └── isStreaming: boolean
│
├── Persistence (optional, activated via session config)
│ ├── sessionsAdapter: SessionsAdapter
│ ├── sessionId: string (auto-created or provided)
│ ├── projectName: string
│ ├── path: string
│ ├── currentBranch: string (default: 'main')
│ └── lastNodeId: string (tracks parentId for next append)
│
├── Methods
│ ├── prompt(input, attachments?, externalCallback?) → Message[]
│ ├── continue(externalCallback?) → Message[]
│ ├── subscribe(fn) → unsubscribe
│ ├── abort()
│ ├── waitForIdle()
│ ├── reset()
│ └── ... (setProvider, setTools, etc.)
│
└── Internal
├── Uses client's middleware pipeline for LLM calls
├── On message_end events, auto-persists to session if configured
└── Tracks parentId/branch automatically

Why composition instead of a SessionConversation subclass: Inheritance creates a fork in the type hierarchy — users must choose between Conversation
and SessionConversation at construction time, and switching means recreating the object. With composition, persistence is just a config flag. You can
even add/remove persistence mid-conversation if needed. The Conversation class checks if (this.persistence) internally — no subclass, no type
branching.

How persistence works internally:

1. When session config is provided, Conversation subscribes to its own events
2. On each message_end event, it calls sessionsAdapter.appendMessage() with the message, current lastNodeId as parentId, current branch, and provider
   info
3. It updates lastNodeId to the new node's ID
4. If sessionId was provided, it validates the session exists on first use. If omitted, it auto-creates on first message.
5. If persistence write fails: behavior depends on usageTrackingMode — in bestEffort, emit a warning event and continue; in strict, throw.

3.4 Middleware pipeline

The internal pipeline that LLMClient uses for complete() and stream() calls. Not exposed publicly in Phase 1.

interface MiddlewareContext {
model: Model<Api>;
context: Context;
options: OptionsForApi<Api>;
requestId: string;
}

type Middleware = (
ctx: MiddlewareContext,
next: () => Promise<BaseAssistantMessage<Api>>
) => Promise<BaseAssistantMessage<Api>>;

Built-in middleware (applied in order):

1. Key resolution: Reads ctx.options.apiKey. If missing, calls keysAdapter.get(ctx.model.api). If still missing, throws ApiKeyNotFoundError. Injects
   the key into ctx.options.
2. Usage tracking: Calls next() to get the result, then calls usageAdapter.track(result). If bestEffort, catches and emits warning. If strict, lets
   the error propagate.

Why this replaces the current approach: Right now, key resolution is copy-pasted in 3 places (complete.ts:52-60, stream.ts:55-63,
conversation.ts:346-365). Usage tracking is handled differently for complete (post-call) and stream (monkey-patching eventStream.result). The
middleware pipeline gives one code path for both concerns.

How streaming works with middleware: For stream(), the middleware chain runs for key resolution (before the stream starts), and usage tracking wraps
eventStream.result() via a proper composition wrapper (not monkey-patching). The middleware sees a StreamMiddlewareContext that carries the event
stream, and the usage tracking middleware attaches to .result() cleanly.

3.5 Typed error hierarchy

LLMError (base)
├── ApiKeyNotFoundError (existing)
├── CostLimitError new: thrown when cost budget exceeded
├── ContextLimitError new: thrown when context window exceeded
├── ConversationBusyError new: prompt() called while another is running
├── ModelNotConfiguredError new: no provider/model set
├── SessionNotFoundError new: sessionId provided but doesn't exist
├── InvalidParentError new: parentId doesn't reference existing node
├── PathTraversalError new: path component contains ../ or similar

Why: Currently all errors are new Error('string message'). Callers can't programmatically distinguish between a cost limit error and a missing model
error without parsing strings. Typed errors enable catch (e) { if (e instanceof CostLimitError) { ... } }.

3.6 Adapter interface changes

KeysAdapter: No changes. Clean as-is.

UsageAdapter: No interface split for now. The track / getStats / getMessages split is theoretically nice but adds interface complexity for a marginal
benefit. We keep one interface but document that track() is the hot-path method and getStats()/getMessages() are cold-path query methods.

SessionsAdapter: Add validation contracts:

- appendMessage with a provided sessionId that doesn't exist must throw SessionNotFoundError
- appendMessage/appendCustom should validate that parentId references an existing node (throw InvalidParentError)
- All path components must be sanitized against traversal

Contract unification: Currently AppendMessageInput in sdk/adapters/types.ts has providerOptions: Record<string, unknown> (required), but
AppendMessageOptions in session-manager.ts has providerOptions?: Record<string, unknown> (optional, defaults to {}). The canonical input types should
live in one place. Since the types package already defines AppendMessageInput, CreateSessionInput, etc. (in session.ts), the SDK should import and
use those — not redeclare them with different optionality.

Looking at the actual code: types/src/session.ts defines AppendMessageInput with providerOptions?: Record<string, unknown> (optional).
sdk/src/adapters/types.ts defines its own AppendMessageInput with providerOptions: Record<string, unknown> (required). This drift happened because
the SDK duplicated the types. Fix: SDK imports from types, removes its own duplicates.

3.7 File adapter hardening

Path traversal protection (applies to FileSessionsAdapter and FileKeysAdapter):

function sanitizePath(component: string): string {
// Reject path traversal attempts
if (component.includes('..') || component.startsWith('/') || component.startsWith('\\')) {
throw new PathTraversalError(component);
}
// Normalize separators and strip leading/trailing whitespace
return component.trim().replace(/\\/g, '/');
}

Applied in getSessionDir, getSessionFilePath, and getKeyPath before joining with the base directory. This prevents projectName: '../../etc/passwd'
from escaping the base directory.

Why this matters: The file adapters use join(this.baseDir, projectName, path) with no validation. Since projectName and path come from user code (and
potentially from user input in a web app), this is a directory traversal vulnerability. An attacker or buggy caller can read/write arbitrary files.

Session ID validation in appendMessage:

// Current behavior (line 294): silently creates a new session
if (!existsSync(filePath)) {
const { sessionId: newId } = await this.createSession({ projectName, path });
// ...
}

// New behavior: throw
if (!existsSync(filePath)) {
throw new SessionNotFoundError(actualSessionId);
}

parentId validation:

// Before appending, verify parentId exists in the session
const nodes = parseJsonl(filePath);
const parentExists = nodes.some(n => n.id === parentId);
if (!parentExists) {
throw new InvalidParentError(parentId, actualSessionId);
}

Why: Without this, you can append a message with parentId: 'nonexistent', creating an orphaned node. The tree structure becomes corrupt —
getBranchHistory can't traverse through orphans, and the session state becomes inconsistent. This is a data integrity issue that's hard to debug
after the fact.

SQLite model reconstruction (sqlite-usage.ts:57-69):

Currently rowToMessage creates a model with placeholder values:
model: {
baseUrl: '', // wrong
reasoning: false, // wrong
input: [], // wrong
cost: { ... }, // zeros
contextWindow: 0, // wrong
maxTokens: 0, // wrong
tools: [], // wrong
}

Fix: Store model_json in the database (the full serialized model). On read, deserialize it. This costs a few extra bytes per row but gives accurate
model metadata.

---

4. Phase-by-Phase Implementation

Phase 0: Bug Fixes and Hardening

Goal: Fix correctness and security issues without changing any public APIs.

PR 1: Fix streaming usage tracking in Conversation

File: packages/sdk/src/agent/conversation.ts

The bug is in \_prepareRun() at line 427. The boundStream function doesn't wrap .result() to call usageAdapter.track():

// CURRENT (broken): usage never tracked for streaming
const boundStream: AgentRunnerConfig['stream'] = (m, ctx, opts, id) => {
return coreStream(m, ctx, { ...opts, apiKey } as OptionsForApi<typeof m.api>, id);
};

// FIXED: wrap result() to track usage
const boundStream: AgentRunnerConfig['stream'] = (m, ctx, opts, id) => {
const eventStream = coreStream(m, ctx, { ...opts, apiKey } as OptionsForApi<typeof m.api>, id);
if (usageAdapter) {
const originalResult = eventStream.result.bind(eventStream);
eventStream.result = async () => {
const message = await originalResult();
await usageAdapter.track(message);
return message;
};
}
return eventStream;
};

Regression test: Create a Conversation with a mock UsageAdapter, run a prompt with streamAssistantMessage: true (default), verify
usageAdapter.track() is called with the assistant message.

PR 2: Fix duplicate lifecycle events

File: packages/sdk/src/agent/conversation.ts

Remove the manual agent_start and turn_start emissions from \_runAgentLoop (line 513-514) and \_runAgentLoopContinue (line 572-573). The core
runAgentLoop at runner.ts:61 and runner.ts:73 already emits these.

// REMOVE these lines from \_runAgentLoop:
this.emit({ type: 'agent_start' }); // line 513 — runner.ts:61 does this
this.emit({ type: 'turn_start' }); // line 514 — runner.ts:73 does this

// REMOVE these lines from \_runAgentLoopContinue:
this.emit({ type: 'agent_start' }); // line 572 — runner.ts:61 does this
this.emit({ type: 'turn_start' }); // line 573 — runner.ts:73 does this

Regression test: Subscribe to events, run a prompt, count occurrences of agent_start and turn_start. Each should appear exactly once per agent run /
turn.

PR 3: Path traversal guards + session integrity

File: packages/sdk/src/adapters/file-sessions.ts

Add sanitizePath() validation in getSessionDir and getSessionFilePath. Add the SessionNotFoundError throw when a provided sessionId doesn't match a
file. Add parentId validation in appendMessage and appendCustom.

File: packages/sdk/src/adapters/file-keys.ts

Add sanitizePath() validation in getKeyPath for the api parameter (though Api is typed, defense in depth).

Regression tests:

- appendMessage({ sessionId: 'nonexistent', ... }) → throws SessionNotFoundError
- appendMessage({ parentId: 'nonexistent', ... }) → throws InvalidParentError
- getSessionDir('../../etc', '') → throws PathTraversalError
- getSessionDir('valid', '../../../etc') → throws PathTraversalError

PR 4: Remove hardcoded default model

File: packages/sdk/src/agent/conversation.ts

Remove lines 54-63 (module-level getModel call that throws at import time). Make provider required in ConversationOptions, or lazily resolve on first
prompt() call.

// CURRENT (brittle): throws at import time if model doesn't exist
const defaultModel = getModel('google', 'gemini-3-flash-preview');
if (!defaultModel) {
throw new Error("Default model 'gemini-3-flash-preview' not found");
}

// NEW: no default. Provider is required.
export interface ConversationOptions {
provider: Provider<Api>; // was optional, now required
// ... rest unchanged
}

Why required instead of lazy: A lazy default hides the dependency on a specific Google model. Making it required forces the user to explicitly choose
their provider, which is the right DX — you should know what model you're paying for.

---

Phase 1: Core Architecture

PR 5: Create @ank1015/llm-sdk-adapters package

New package: packages/sdk-adapters/

packages/sdk-adapters/
├── package.json
├── tsconfig.json
├── AGENTS.md
└── src/
├── index.ts
├── file-keys.ts (moved from sdk/src/adapters/)
├── sqlite-usage.ts (moved from sdk/src/adapters/)
├── file-sessions.ts (moved from sdk/src/adapters/)
├── memory-keys.ts (new)
├── memory-usage.ts (new)
└── memory-sessions.ts (new)

package.json for sdk-adapters:
{
"name": "@ank1015/llm-sdk-adapters",
"dependencies": {
"@ank1015/llm-sdk": "workspace:^",
"@ank1015/llm-core": "workspace:^",
"@ank1015/llm-types": "workspace:^",
"better-sqlite3": "^11.0.0"
}
}

package.json for sdk (updated):
{
"dependencies": {
"@ank1015/llm-core": "workspace:^",
"@ank1015/llm-types": "workspace:^"
// better-sqlite3 REMOVED
}
}

The SDK root export removes FileKeysAdapter, SqliteUsageAdapter, FileSessionsAdapter. It keeps adapter interfaces, Conversation, LLMClient, and all
re-exports from core/types.

Users update imports:
// Before
import { Conversation, FileKeysAdapter, SqliteUsageAdapter } from '@ank1015/llm-sdk';

// After
import { Conversation } from '@ank1015/llm-sdk';
import { FileKeysAdapter, SqliteUsageAdapter } from '@ank1015/llm-sdk-adapters';

In-memory adapters (in sdk-adapters for convenience, zero deps):

// memory-keys.ts
export class InMemoryKeysAdapter implements KeysAdapter {
private keys = new Map<Api, string>();
async get(api: Api) { return this.keys.get(api); }
async set(api: Api, key: string) { this.keys.set(api, key); }
async delete(api: Api) { return this.keys.delete(api); }
async list() { return [...this.keys.keys()]; }
}

Similar trivial implementations for InMemoryUsageAdapter and InMemorySessionsAdapter. These are essential for testing — currently there's no way to
unit test SDK code without hitting the filesystem or SQLite.

PR 6: Unify adapter input types

Remove duplicated types from sdk/src/adapters/types.ts. Import from @ank1015/llm-types instead.

Currently sdk/src/adapters/types.ts defines its own CreateSessionInput, AppendMessageInput, AppendCustomInput, SessionLocation. These duplicate the
ones in types/src/session.ts with subtle differences (providerOptions required vs optional).

Fix: Delete the local definitions. Import from types. The types package is the single source of truth.

// sdk/src/adapters/types.ts — AFTER
import type {
CreateSessionInput,
AppendMessageInput,
AppendCustomInput,
SessionLocation,
} from '@ank1015/llm-types';

// Re-export for consumers
export type { CreateSessionInput, AppendMessageInput, AppendCustomInput, SessionLocation };

This also means the SessionsAdapter interface references the types-package versions of these inputs, which have providerOptions?: Record<string,
unknown> (optional). The file adapter defaults it to {} in the implementation.

PR 7: Add resolveApiKey utility

New file: packages/sdk/src/utils/resolve-key.ts

import type { Api } from '@ank1015/llm-types';
import type { KeysAdapter } from '../adapters/types.js';
import { ApiKeyNotFoundError } from '@ank1015/llm-types';

export async function resolveApiKey(
api: Api,
providerOptions?: Record<string, unknown>,
keysAdapter?: KeysAdapter
): Promise<string> {
if (providerOptions && 'apiKey' in providerOptions && providerOptions.apiKey) {
return providerOptions.apiKey as string;
}
if (keysAdapter) {
const key = await keysAdapter.get(api);
if (key) return key;
}
throw new ApiKeyNotFoundError(api);
}

Replace the 3 duplicated implementations in complete.ts, stream.ts, and conversation.ts with calls to this utility.

PR 8: Add typed error classes

New file: packages/sdk/src/errors.ts

import { LLMError } from '@ank1015/llm-types';

export class CostLimitError extends LLMError {
constructor(currentCost: number, limit: number) {
super('COST_LIMIT', `Cost limit exceeded: ${currentCost} >= ${limit}`);
}
}

export class ContextLimitError extends LLMError {
constructor(inputTokens: number, limit: number) {
super('CONTEXT_LIMIT', `Context limit exceeded: ${inputTokens} >= ${limit}`);
}
}

export class ConversationBusyError extends LLMError {
constructor() {
super('CONVERSATION_BUSY', 'Cannot start a new prompt while another is running');
}
}

export class ModelNotConfiguredError extends LLMError {
constructor() {
super('MODEL_NOT_CONFIGURED', 'No model configured on provider');
}
}

export class SessionNotFoundError extends LLMError {
constructor(sessionId: string) {
super('SESSION_NOT_FOUND', `Session '${sessionId}' not found`);
}
}

export class InvalidParentError extends LLMError {
constructor(parentId: string, sessionId: string) {
super('INVALID_PARENT', `Parent node '${parentId}' not found in session '${sessionId}'`);
}
}

export class PathTraversalError extends LLMError {
constructor(path: string) {
super('PATH_TRAVERSAL', `Path component '${path}' contains invalid traversal characters`);
}
}

Replace all new Error('string') in Conversation with typed errors.

PR 9: LLMClient

New file: packages/sdk/src/client.ts

export interface LLMClientConfig {
keys?: KeysAdapter;
usage?: UsageAdapter;
sessions?: SessionsAdapter;
defaultProvider?: Provider<Api>;
usageTrackingMode?: 'strict' | 'bestEffort'; // default: 'bestEffort'
}

export class LLMClient {
readonly keys?: KeysAdapter;
readonly usage?: UsageAdapter;
readonly sessions?: SessionsAdapter;
readonly defaultProvider?: Provider<Api>;
readonly usageTrackingMode: 'strict' | 'bestEffort';

    constructor(config: LLMClientConfig = {}) {
      this.keys = config.keys;
      this.usage = config.usage;
      this.sessions = config.sessions;
      this.defaultProvider = config.defaultProvider;
      this.usageTrackingMode = config.usageTrackingMode ?? 'bestEffort';
    }

    async complete<TApi extends Api>(
      model: Model<TApi>,
      context: Context,
      providerOptions?: Partial<OptionsForApi<TApi>>
    ): Promise<BaseAssistantMessage<TApi>> {
      const apiKey = await resolveApiKey(model.api, providerOptions, this.keys);
      const finalOptions = { ...providerOptions, apiKey } as OptionsForApi<TApi>;
      const requestId = generateRequestId();
      const message = await coreComplete(model, context, finalOptions, requestId);
      await this.trackUsage(message);
      return message;
    }

    async stream<TApi extends Api>(
      model: Model<TApi>,
      context: Context,
      providerOptions?: Partial<OptionsForApi<TApi>>
    ): Promise<AssistantMessageEventStream<TApi>> {
      const apiKey = await resolveApiKey(model.api, providerOptions, this.keys);
      const finalOptions = { ...providerOptions, apiKey } as OptionsForApi<TApi>;
      const requestId = generateRequestId();
      const eventStream = coreStream(model, context, finalOptions, requestId);
      return this.wrapStreamWithTracking(eventStream);
    }

    createConversation(opts: ConversationOptions): Conversation {
      return new Conversation({
        ...opts,
        keysAdapter: opts.keysAdapter ?? this.keys,
        usageAdapter: opts.usageAdapter ?? this.usage,
        sessionsAdapter: opts.sessionsAdapter ?? this.sessions,
        usageTrackingMode: opts.usageTrackingMode ?? this.usageTrackingMode,
      });
    }

    // Session query methods (delegate to adapter)
    async listSessions(projectName: string, path?: string) { ... }
    async getSession(projectName: string, sessionId: string, path?: string) { ... }
    async searchSessions(projectName: string, query: string, path?: string) { ... }
    async listProjects() { ... }

    // Internal
    private async trackUsage(message: BaseAssistantMessage<Api>): Promise<void> {
      if (!this.usage) return;
      try {
        await this.usage.track(message);
      } catch (e) {
        if (this.usageTrackingMode === 'strict') throw e;
        // bestEffort: swallow, could emit warning via optional callback
      }
    }

    private wrapStreamWithTracking<TApi extends Api>(
      eventStream: AssistantMessageEventStream<TApi>
    ): AssistantMessageEventStream<TApi> {
      if (!this.usage) return eventStream;
      // Composition wrapper instead of monkey-patching
      const originalResult = eventStream.result.bind(eventStream);
      const tracker = this.usage;
      const mode = this.usageTrackingMode;
      return Object.create(eventStream, {
        result: {
          value: async () => {
            const message = await originalResult();
            try {
              await tracker.track(message);
            } catch (e) {
              if (mode === 'strict') throw e;
            }
            return message;
          }
        }
      });
    }

}

The old standalone complete() and stream() functions remain as thin wrappers for backwards compatibility during migration:

// sdk/src/llm/complete.ts — simplified
export async function complete<TApi extends Api>(
model: Model<TApi>,
context: Context,
options: CompleteOptions<TApi> = {},
id?: string
): Promise<BaseAssistantMessage<TApi>> {
const apiKey = await resolveApiKey(model.api, options.providerOptions, options.keysAdapter);
const finalOptions = { ...options.providerOptions, apiKey } as OptionsForApi<TApi>;
const requestId = id ?? generateRequestId();
const message = await coreComplete(model, context, finalOptions, requestId);
if (options.usageAdapter) await options.usageAdapter.track(message);
return message;
}

These old functions get a @deprecated JSDoc tag pointing to LLMClient.

PR 10: Session-aware Conversation

Add optional session config to ConversationOptions:

export interface ConversationSessionConfig {
projectName: string;
path?: string;
sessionId?: string; // omit to auto-create
sessionName?: string; // used when auto-creating
branch?: string; // default: 'main'
}

export interface ConversationOptions {
provider: Provider<Api>; // now required (Phase 0 change)
session?: ConversationSessionConfig;
sessionsAdapter?: SessionsAdapter;
// ... rest unchanged
}

Internal persistence logic in Conversation:

private persistence?: {
adapter: SessionsAdapter;
projectName: string;
path: string;
sessionId?: string; // set after first message or validation
branch: string;
lastNodeId?: string; // tracks parentId for next append
};

// In constructor:
if (opts.session && opts.sessionsAdapter) {
this.persistence = {
adapter: opts.sessionsAdapter,
projectName: opts.session.projectName,
path: opts.session.path ?? '',
sessionId: opts.session.sessionId,
branch: opts.session.branch ?? 'main',
};
}

In \_createRunnerCallbacks, after appending a message to internal state, also persist:

appendMessage: async (m) => {
this.appendMessage(m);
onMessageAppended?.(m);
await this.persistMessage(m);
},

The persistMessage method:

private async persistMessage(message: Message): Promise<void> {
if (!this.persistence) return;

    const { adapter, projectName, path, branch } = this.persistence;

    // Auto-create session on first message if no sessionId
    if (!this.persistence.sessionId) {
      const { sessionId, header } = await adapter.createSession({
        projectName,
        path,
        sessionName: this.sessionConfig?.sessionName,
      });
      this.persistence.sessionId = sessionId;
      this.persistence.lastNodeId = header.id;
    }

    const parentId = this.persistence.lastNodeId!;

    const { node } = await adapter.appendMessage({
      projectName,
      path,
      sessionId: this.persistence.sessionId,
      parentId,
      branch,
      message,
      api: this._state.provider.model.api,
      modelId: this._state.provider.model.id,
    });

    this.persistence.lastNodeId = node.id;

}

Loading from an existing session: When sessionId is provided, on the first prompt() call (or in constructor), validate the session exists and load
the latest node as lastNodeId:

private async initializePersistence(): Promise<void> {
if (!this.persistence || this.persistence.lastNodeId) return;

    const { adapter, projectName, path, sessionId, branch } = this.persistence;

    if (sessionId) {
      const session = await adapter.getSession({ projectName, path, sessionId });
      if (!session) throw new SessionNotFoundError(sessionId);

      this.persistence.sessionId = sessionId;
      // Find the latest node on the current branch
      const branchNodes = session.nodes.filter(n => n.branch === branch);
      const latest = branchNodes[branchNodes.length - 1];
      this.persistence.lastNodeId = latest?.id ?? session.header.id;
    }

}

---

Phase 2: Fix SQLite model storage

PR 11: Store full model in SQLite

Add a model_json column to the messages table. On track(), serialize JSON.stringify(message.model). On rowToMessage(), deserialize it instead of
constructing a placeholder.

ALTER TABLE messages ADD COLUMN model_json TEXT;

Handle migration: if model_json is null (old rows), fall back to the current placeholder reconstruction. New rows always have the real model.

---

Phase 3: Remove deprecated APIs

After one release cycle with @deprecated tags:

- Remove standalone complete() and stream() functions from SDK (users use LLMClient)
- Remove SessionManager class (users use LLMClient session methods or Conversation persistence)
- Remove old CompleteOptions and StreamOptions types

---

5. Migration Guide for Users

// ============ BEFORE ============

import {
Conversation,
FileKeysAdapter,
SqliteUsageAdapter,
FileSessionsAdapter,
SessionManager,
complete,
stream,
} from '@ank1015/llm-sdk';

const keys = new FileKeysAdapter();
const usage = new SqliteUsageAdapter();
const sessions = new FileSessionsAdapter();
const sessionManager = new SessionManager(sessions);

// One-shot call
const msg = await complete(model, context, { keysAdapter: keys, usageAdapter: usage });

// Conversation (no persistence)
const convo = new Conversation({ keysAdapter: keys, usageAdapter: usage });
convo.setProvider(provider);

// Manual persistence (painful)
convo.subscribe(async (event) => {
if (event.type === 'message*end') {
await sessionManager.appendMessage({
projectName: 'myapp',
sessionId: currentSessionId,
parentId: lastNodeId,
branch: 'main',
message: event.message,
api: provider.model.api,
modelId: provider.model.id,
});
lastNodeId = /* track manually \_/;
}
});

// ============ AFTER ============

import { LLMClient } from '@ank1015/llm-sdk';
import { FileKeysAdapter, SqliteUsageAdapter, FileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

const client = new LLMClient({
keys: new FileKeysAdapter(),
usage: new SqliteUsageAdapter(),
sessions: new FileSessionsAdapter(),
});

// One-shot call (adapters auto-wired)
const msg = await client.complete(model, context);

// Conversation with auto-persistence (one line)
const convo = client.createConversation({
provider,
session: { projectName: 'myapp', sessionName: 'Chat 1' },
});

// Messages auto-persist. No manual tracking.
await convo.prompt('Hello');

---

6. PR Ordering and Dependencies

PR 1: Fix streaming usage tracking (standalone)
PR 2: Fix duplicate lifecycle events (standalone)
PR 3: Path traversal + session integrity (standalone)
PR 4: Remove default model (standalone)
↓ (PRs 1-4 can all be done in parallel)
PR 5: Create sdk-adapters package (depends on PR 3 for hardened adapters)
PR 6: Unify adapter input types (standalone, can parallel with PR 5)
PR 7: Add resolveApiKey utility (standalone)
PR 8: Add typed error classes (depends on PR 3 for new error types)
↓
PR 9: Add LLMClient (depends on PRs 5, 7, 8)
PR 10: Session-aware Conversation (depends on PRs 5, 8, 9)
PR 11: Fix SQLite model storage (standalone, can be done anytime)
↓
PR 12: Deprecate old APIs (depends on PRs 9, 10)
↓ (next release)
PR 13: Remove deprecated APIs (depends on PR 12 shipping)

PRs 1-4 are independent bug fixes. Ship them first as a patch release. PRs 5-10 are the architectural changes. Ship as a minor (or major, since we're
breaking). PR 11 is a standalone improvement. PRs 12-13 are cleanup.

---
