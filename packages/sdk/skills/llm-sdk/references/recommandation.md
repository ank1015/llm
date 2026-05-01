# Recommendations

Use `@ank1015/llm-sdk` in the most boring way possible:

- Prefer the default gateway credentials first.
- Prefer the default session behavior first.
- Only create a local `keys.env` or custom session path when the defaults are not enough.

## Keys

Use the gateway first:

```ts
// Normal calls use ~/.llm/gateway.json automatically.
```

This reads `~/.llm/gateway.json`, refreshes tokens when needed, and sends model calls through the gateway.

If you need direct provider calls instead, opt in first:

```ts
setSdkConfig({ modelTransport: 'direct' });
```

## Provider And Model Choice

Ask the user which provider/model they want when the choice affects behavior, cost, or compatibility.

If the user does not care, use this preference order:

1. Use `openai/gpt-5.4-mini` for general-purpose work.
2. Use `anthropic/claude-sonnet-4-6` when the user asks for Claude or the task benefits from Anthropic behavior.
3. Use a Google model when the user asks for Gemini or Google-specific behavior.

Examples:

- choose `openai/gpt-5.4-mini` for normal chat
- choose `azure-openai/gpt-5.4-mini` when the user explicitly wants the Azure OpenAI provider
- choose `anthropic/claude-sonnet-4-6` for Claude-specific runs

## When The Gateway Is Enough

If `~/.llm/gateway.json` exists:

- call `llm()` or `agent()` normally
- use `openai/...` for the OpenAI gateway provider and `azure-openai/...` for the Azure OpenAI gateway provider
- do not pass `keysFilePath`
- let the sdk use the gateway automatically

Example:

```ts
import { llm, userMessage } from '@ank1015/llm-sdk';

const message = await llm({
  modelId: 'openai/gpt-5.4-mini',
  messages: [userMessage('Summarize this file.')],
});
```

## When You Need Your Own `keys.env`

If you explicitly need direct provider calls:

1. Call `setSdkConfig({ modelTransport: 'direct' })`.
2. Ask the user for the missing keys.
3. Create a local `keys.env`.
4. Write only the credentials you need.
5. Pass that file through `keysFilePath`.

Use `setProviderCredentials()` when you want to write the file safely:

```ts
import { setProviderCredentials } from '@ank1015/llm-sdk/keys';

const keysFilePath = '/tmp/project-keys.env';

await setProviderCredentials(keysFilePath, 'openai', {
  apiKey: process.env.OPENAI_API_KEY!,
});
```

Then pass it to `llm()` or `agent()`:

```ts
const message = await llm({
  modelId: 'openai/gpt-5.4-mini',
  messages: [userMessage('Summarize this file.')],
  keysFilePath,
});
```

## Sessions

Prefer the default session behavior for `agent()`:

- if you do not pass `session.path`, the sdk creates a session automatically under `~/.llm-sdk/sessions`
- this is the right default for most agent runs

Only pass a custom `session.path` when you specifically need to:

- continue a known session
- inspect a deterministic file location
- isolate test or temporary runs

For one-off `llm()` calls, there is no session file unless your code creates one separately.

## Practical Rule

- Use the gateway when it already has what you need.
- Use the default agent session path unless you need explicit control.
- Ask for provider/model choice when it matters.
- If the user does not care, use `openai/gpt-5.4-mini` for general work.
