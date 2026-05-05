# @ank1015/llm-sdk

Opinionated SDK over `@ank1015/llm-core` with curated chat model IDs, gateway-backed `llm()`/`agent()`/`image()` helpers, direct-key opt-out for chat models, and JSONL session tooling.

## What You Get

- `llm()` for one-off model calls through the configured gateway and curated `modelId` strings
- `agent()` for multi-turn runs with tool execution and persisted session history
- `image()` for generation and editing with saved output files
- Helpers like `userMessage()`, `toolResultMessage()`, `getText()`, `getThinking()`, and `getToolCalls()`
- Subpath modules for runtime config, keys-file management, and session inspection

## Installation

```bash
pnpm add @ank1015/llm-sdk
```

If your app defines tool schemas with `Type.Object(...)`, also add `@sinclair/typebox` to your project so you can import `Type` directly.

## Quick Start

By default the SDK uses gateway credentials from `~/.llm/gateway.json`:

```json
{
  "gatewayBaseUrl": "https://gateway.example",
  "accessToken": "...",
  "refreshToken": "...",
  "accessTokenExpiresAt": 1777542373000,
  "refreshTokenExpiresAt": 1780133473000
}
```

Then make a simple call:

```ts
import { getText, llm, userMessage } from '@ank1015/llm-sdk';

const message = await llm({
  modelId: 'openai/gpt-5.4-mini',
  messages: [userMessage('Explain event loops in two sentences.')],
});

console.log(getText(message));
```

For chat models, the prefix selects the provider: `openai/...` routes through the OpenAI provider, while `azure-openai/...` routes through the Azure OpenAI provider.

## Agent Runs

```ts
import { agent, getText, userMessage } from '@ank1015/llm-sdk';

const result = await agent({
  modelId: 'anthropic/claude-sonnet-4-6',
  system: 'You are a careful debugging assistant.',
  inputMessages: [userMessage('Summarize the latest session state.')],
});

if (!result.ok) {
  throw new Error(result.error.message);
}

console.log(result.sessionPath);
console.log(getText(result.finalAssistantMessage));
```

## Image Generation

```ts
import { image } from '@ank1015/llm-sdk';

const result = await image({
  prompt: 'Create a polished travel sticker of a floating tea cart.',
  output: './artifacts/tea-cart.png',
  size: '1024x1024',
  quality: 'low',
});

console.log(result.path);
console.log(result.paths);
```

## Config, Keys, And Sessions

Use subpath imports for the operational helpers:

```ts
import { getSdkConfig, setSdkConfig } from '@ank1015/llm-sdk/config';
import { setProviderCredentials } from '@ank1015/llm-sdk/keys';
import { loadSessionMessages } from '@ank1015/llm-sdk/session';
```

Defaults:

- keys file: `~/.llm-sdk/keys.env`
- gateway credentials file: `~/.llm/gateway.json`
- session directory: `~/.llm-sdk/sessions`

See [docs/setup.md](./docs/setup.md) for the full setup, keys-file, and session-helper guide.

## Docs

- [docs/image.md](./docs/image.md) - `image()` usage, saved output paths, editing inputs, and output options
- [docs/llm.md](./docs/llm.md) - `llm()` usage, streaming, and response handling
- [docs/agent.md](./docs/agent.md) - `agent()` runs, tools, and failure modes
- [docs/types.md](./docs/types.md) - exported message, tool, and runtime types
- [docs/setup.md](./docs/setup.md) - config, credential files, and session helpers
- [docs/testing-and-release.md](./docs/testing-and-release.md) - local validation and packaging checklist

## Publish Surface

Public subpath exports:

- `@ank1015/llm-sdk/agent`
- `@ank1015/llm-sdk/config`
- `@ank1015/llm-sdk/image`
- `@ank1015/llm-sdk/keys`
- `@ank1015/llm-sdk/llm`
- `@ank1015/llm-sdk/messages`
- `@ank1015/llm-sdk/model-input`
- `@ank1015/llm-sdk/response`
- `@ank1015/llm-sdk/session`
- `@ank1015/llm-sdk/tool`
