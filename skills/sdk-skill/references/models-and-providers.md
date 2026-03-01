# Models and Providers

## Supported Providers (Api type)

```ts
type Api =
  | 'openai'
  | 'codex'
  | 'google'
  | 'deepseek'
  | 'anthropic'
  | 'claude-code'
  | 'zai'
  | 'kimi'
  | 'minimax'
  | 'cerebras'
  | 'openrouter';
```

## Looking Up Models

```ts
import { getModel, getModels, getProviders, MODELS } from '@ank1015/llm-sdk';

// Get a specific model
const model = getModel('anthropic', 'claude-sonnet-4-5');

// List all models for a provider
const anthropicModels = getModels('anthropic');

// List all available provider names
const providers = getProviders(); // Api[]

// Direct access to the models registry
MODELS.anthropic; // Record<modelId, Model<'anthropic'>>
MODELS.openai; // Record<modelId, Model<'openai'>>
```

## Key Models by Provider

### Anthropic

| Model ID            | Name       | Reasoning | Input       | Context | Cost (in/out $/M) |
| ------------------- | ---------- | --------- | ----------- | ------- | ----------------- |
| `claude-opus-4-6`   | Opus 4.6   | yes       | text, image | 200k    | 5/25              |
| `claude-opus-4-5`   | Opus 4.5   | yes       | text, image | 200k    | 5/25              |
| `claude-sonnet-4-5` | Sonnet 4.5 | yes       | text, image | 200k    | 3/15              |
| `claude-haiku-4-5`  | Haiku 4.5  | yes       | text, image | 200k    | 1/5               |

### OpenAI

| Model ID      | Name        | Input             | Context | Cost (in/out $/M) |
| ------------- | ----------- | ----------------- | ------- | ----------------- |
| `gpt-5.2`     | GPT-5.2     | text, image, file | 400k    | 1.75/14           |
| `gpt-5.2-pro` | GPT-5.2 Pro | text, image, file | 400k    | 21/168            |
| `gpt-5-mini`  | GPT-5 Mini  | text, image, file | 400k    | 0.25/2            |
| `gpt-5-nano`  | GPT-5 Nano  | text, image, file | 400k    | 0.05/0.4          |

### Google

| Model ID                 | Name           | Input             | Context | Cost (in/out $/M) |
| ------------------------ | -------------- | ----------------- | ------- | ----------------- |
| `gemini-3-pro-preview`   | Gemini 3 Pro   | text, image, file | 1M      | 2/12              |
| `gemini-3-flash-preview` | Gemini 3 Flash | text, image, file | 1M      | 0.5/3             |

### Others

| Provider   | Model ID            | Name         | Context | Cost (in/out $/M) |
| ---------- | ------------------- | ------------ | ------- | ----------------- |
| deepseek   | `deepseek-reasoner` | V3.2         | 128k    | 0.28/0.42         |
| zai        | `glm-4.7`           | GLM-4.7      | 200k    | 0.43/1.75         |
| kimi       | `kimi-k2.5`         | K2.5         | 262k    | 0.6/3.0           |
| minimax    | `MiniMax-M2.5`      | M2.5         | 204k    | 0.3/1.2           |
| cerebras   | `gpt-oss-120b`      | GPT-OSS 120B | 128k    | 0.35/0.75         |
| openrouter | (hundreds)          | Various      | varies  | varies            |

### Special Providers

- **codex**: Uses `gpt-5.3-codex`, requires `apiKey` + `chatgpt-account-id`
- **claude-code**: Same Anthropic models, requires `oauthToken` + `betaFlag` + `billingHeader`

## Model Shape

```ts
interface Model<TApi extends Api> {
  id: string; // e.g. "claude-sonnet-4-5"
  name: string; // e.g. "Sonnet 4.5"
  api: TApi;
  baseUrl: string;
  reasoning: boolean;
  input: ('text' | 'image' | 'file')[];
  cost: { input: number; output: number; cacheRead: number; cacheWrite: number };
  contextWindow: number;
  maxTokens: number;
  headers?: Record<string, string>;
  tools: string[];
  excludeSettings?: string[];
}
```

## Provider Shape

```ts
interface Provider<TApi extends Api> {
  model: Model<TApi>;
  providerOptions?: OptionsForApi<TApi>; // with apiKey optional
}
```

### Setting Provider on Conversation

```ts
convo.setProvider({
  model: getModel('anthropic', 'claude-sonnet-4-5')!,
  providerOptions: { apiKey: 'sk-...' }, // optional if using keysAdapter
});
```

## Calculating Cost

```ts
import { calculateCost, getModel } from '@ank1015/llm-sdk';

const model = getModel('anthropic', 'claude-sonnet-4-5')!;
const cost = calculateCost(model, message.usage);
// { input, output, cacheRead, cacheWrite, total } — in USD
```

## Provider-Specific Options

Each provider has its own options type. Common fields:

- `apiKey: string` — required (unless using keysAdapter)
- `signal?: AbortSignal` — for cancellation

### Anthropic / MiniMax / Claude Code

```ts
// Extends Anthropic MessageCreateParams (minus model/messages/system/max_tokens)
{ apiKey, signal?, max_tokens?, /* ...anthropic-specific params */ }
```

### OpenAI

```ts
// Extends OpenAI ResponseCreateParams (minus model/input)
{ apiKey, signal?, /* ...openai-specific params */ }
```

### Google

```ts
// Extends Google GenerateContentConfig (minus abortSignal/systemPrompt)
{ apiKey, signal?, thinkingConfig?, /* ...google-specific params */ }
```

Google thinking levels: `import { GoogleThinkingLevel } from '@ank1015/llm-sdk'`

### Z.AI / Kimi

```ts
// Extends OpenAI ChatCompletionCreateParams (minus model/messages)
{ apiKey, signal?, thinking?: { type: 'enabled' | 'disabled' } }
```

### Codex (special)

```ts
{ apiKey, 'chatgpt-account-id', signal?, instructions? }
// Some settings excluded: stream, store, max_output_tokens, temperature, top_p, truncation
```

## Checking Api Validity

```ts
import { isValidApi, KnownApis } from '@ank1015/llm-sdk';

isValidApi('anthropic'); // true
isValidApi('unknown'); // false
KnownApis; // readonly ['openai', 'codex', 'google', ...] as const
```
