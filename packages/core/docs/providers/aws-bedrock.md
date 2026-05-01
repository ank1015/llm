# AWS Bedrock Provider Options

`@ank1015/llm-core` uses Amazon Bedrock `ConverseStream` for the built-in `aws-bedrock` chat provider. The first built-in catalog targets Anthropic Claude models on Bedrock.

Core stays stateless. Pass AWS region and credentials in provider options; SDK or gateway layers can resolve environment variables before calling core.

Core manages these fields:

- `modelId` is `model.id`
- `messages` are built from the normalized core message format
- `system` is built from `context.systemPrompt`
- `toolConfig` is built from `context.tools` and optional Bedrock tool options

## Basic Usage

```ts
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('aws-bedrock', 'anthropic.claude-sonnet-4-6');

if (!model) {
  throw new Error('Model not found');
}

const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Explain event sourcing in one paragraph.' }],
      },
    ],
  },
  {
    region: 'us-east-1',
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
      sessionToken: process.env.AWS_SESSION_TOKEN,
    },
  },
  'msg-1'
);

console.log(result.content);
```

## Client Settings

Use explicit credentials:

```ts
{
  region: 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
}
```

Or use a named AWS profile for this client:

```ts
{
  region: 'us-west-2',
  profile: 'dev',
}
```

Custom Bedrock-compatible endpoints and Bedrock bearer-token auth can also be passed:

```ts
{
  region: 'us-east-1',
  endpoint: 'https://bedrock-runtime.us-east-1.amazonaws.com',
  bearerToken: process.env.AWS_BEARER_TOKEN_BEDROCK,
}
```

Core does not read `AWS_REGION`, `AWS_PROFILE`, or credential environment variables itself.

## Bedrock Request Options

Most `ConverseStreamCommandInput` fields can be passed directly, including `inferenceConfig`, `additionalModelRequestFields`, `requestMetadata`, guardrails, performance config, and service tier. Core omits and rebuilds `modelId`, `messages`, `system`, and `toolConfig`.

```ts
await complete(
  model,
  {
    systemPrompt: 'You are concise.',
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Plan a safe refactor for this module.' }],
      },
    ],
  },
  {
    region: 'us-east-1',
    profile: 'dev',
    inferenceConfig: {
      maxTokens: 4000,
      temperature: 0.2,
    },
    reasoning: 'medium',
    thinkingDisplay: 'summarized',
    cacheRetention: 'short',
  },
  'msg-2'
);
```

Prior assistant messages from `aws-bedrock` are replayed from the preserved Bedrock native content. Assistant messages from other providers are converted through normalized text, thinking, and tool-call blocks.
