# Recommendations

Use `@ank1015/llm-sdk` in the most boring way possible:

- Prefer the central sdk keystore first.
- Prefer the default session behavior first.
- Only create a local `keys.env` or custom session path when the central defaults are not enough.

## Keys

Check the central keystore first:

```ts
import { getAvailableKeyProviders } from '@ank1015/llm-sdk/keys';

const availableProviders = await getAvailableKeyProviders();
```

This reads the default sdk keys file at `~/.llm-sdk/keys.env` and returns only provider names with complete credentials. It does not reveal the secret values.

If you need to inspect a different keys file, pass a path:

```ts
const availableProviders = await getAvailableKeyProviders('/tmp/project-keys.env');
```

## Provider And Model Choice

Ask the user which provider/model they want when the choice affects behavior, cost, or compatibility.

If the user does not care, use this preference order:

1. Prefer `codex/*` over `openai/*` when both `codex` and `openai` are available.
2. Prefer `claude-code/*` over `anthropic/*` when both `claude-code` and `anthropic` are available.
3. Use another available provider only when those preferred pairs are not available or the task clearly needs another provider.

Examples:

- choose `codex/gpt-5.4-mini` before `openai/gpt-5.4-mini`
- choose `claude-code/claude-sonnet-4-6` before `anthropic/claude-sonnet-4-6`

## When The Central Keystore Is Enough

If the provider you want is already available in the central keystore:

- call `llm()` or `agent()` normally
- do not pass `keysFilePath`
- let the sdk use the default keys file automatically

Example:

```ts
import { llm, userMessage } from '@ank1015/llm-sdk';

const message = await llm({
  modelId: 'codex/gpt-5.4-mini',
  messages: [userMessage('Summarize this file.')],
});
```

## When You Need Your Own `keys.env`

If the needed provider is not available centrally:

1. Ask the user for the missing keys.
2. Create a local `keys.env`.
3. Write only the credentials you need.
4. Pass that file through `keysFilePath`.

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

- Use the central keystore when it already has what you need.
- Use the default agent session path unless you need explicit control.
- Ask for provider/model choice when it matters.
- If the user does not care, prefer `codex` over `openai` and `claude-code` over `anthropic`.
