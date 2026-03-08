---
name: llm-use
description: Use this skill whenever working with LLMs through @ank1015/llm-sdk or @ank1015/llm-sdk-adapters, including one-off calls, streaming, and agent-style conversations with API keys already configured.
compatibility: Requires Node.js and the @ank1015/llm-sdk packages that ship with @ank1015/llm-agents.
---

# LLM SDK Usage

Use this skill for normal application code that talks to LLMs through the public SDK packages:

- `@ank1015/llm-sdk`
- `@ank1015/llm-sdk-adapters`

These packages let you:

- make one-off LLM calls with `complete()` and `stream()`
- build stateful or tool-using agents with `Conversation`
- use file-key-backed credentials through `createFileKeysAdapter()`
- save and reload conversations with file or memory session adapters
- work from the public SDK input and response types

## Working Model

- This skill is installed inside the artifact at `.max/skills/llm-use/`.
- Relative paths in this skill are relative to the skill directory.
- Temporary helper files for this artifact should go under `<artifactDir>/.max/temp/llm-use/`.
- Final user-facing outputs should stay in the artifact directory unless the user asks for a different location.
- Prefer bundled scripts first. If the task needs an extra one-off helper, keep it ephemeral under `<artifactDir>/.max/temp/llm-use/`.

## Bundled Executable

- `scripts/complete-once.mjs` — send a single prompt through the SDK and print normalized text or JSON

Run it from the artifact root:

```bash
node .max/skills/llm-use/scripts/complete-once.mjs --help
node .max/skills/llm-use/scripts/complete-once.mjs --prompt "Summarize this diff."
```

## Start Here

Pick the reference that matches the task:

- For one-off calls, streamed output, or model lookup, read [references/one-off-calls.md](references/one-off-calls.md).
- For multi-turn agents, tools, events, or `Conversation` lifecycle methods, read [references/conversation.md](references/conversation.md).
- For saving, loading, or replaying conversation history with sessions, read [references/sessions-and-persistence.md](references/sessions-and-persistence.md).
- For TypeScript shapes such as inputs, messages, assistant responses, events, tools, attachments, and session nodes, read [references/types.md](references/types.md).

## Default Rules

- Prefer `createFileKeysAdapter()` as the default credential path.
- Assume credentials are already configured in the file keys adapter unless the task is explicitly about credential management.
- Do not use env vars or direct `providerOptions.apiKey` in normal examples.
- Prefer `createFileSessionsAdapter()` for durable session storage.
- Prefer `InMemorySessionsAdapter` for ephemeral runs and tests.
- Use `createSessionManager()` instead of inventing ad hoc JSON persistence around `Conversation`.
- Prefer public imports from `@ank1015/llm-sdk` and `@ank1015/llm-sdk-adapters`.
- Do not import from `@ank1015/llm-core` or internal package paths for normal task code.

Usage tracking adapters exist, but they are intentionally out of scope for this skill's main workflow.
