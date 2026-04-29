# Azure OpenAI Provider Options

`@ank1015/llm-core` uses the OpenAI Responses API shape for the built-in Azure OpenAI provider. The normalized streaming events, preserved native response, tool calls, usage mapping, and reasoning handling match the OpenAI provider.

Core stays stateless. Pass Azure credentials and endpoint settings in `providerOptions`.

Core manages these fields:

- `model` is the Azure deployment name
- `input` is built from the normalized core message format
- `context.systemPrompt` becomes the leading OpenAI `developer` message

## Basic Usage

```ts
import { complete, getModel } from '@ank1015/llm-core';

const model = getModel('azure-openai', 'gpt-5.4');

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
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    azureBaseURL: 'https://my-resource.openai.azure.com/openai/v1',
    azureDeploymentName: 'prod-gpt-54',
  },
  'msg-1'
);

console.log(result.content);
```

## Endpoint Settings

You can provide the Azure base URL directly:

```ts
{
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  azureBaseURL: 'https://my-resource.openai.azure.com/openai/v1',
}
```

Or build it from the resource endpoint:

```ts
{
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  azureEndpoint: 'https://my-resource.openai.azure.com',
}
```

Or build it from a resource name:

```ts
{
  apiKey: process.env.AZURE_OPENAI_API_KEY!,
  azureResourceName: 'my-resource',
}
```

If `azureDeploymentName` is omitted, core uses `model.id` as the deployment name. `azureApiVersion` defaults to `v1`.

## OpenAI Responses Options

Responses API fields like `reasoning`, `max_output_tokens`, `prompt_cache_key`, `prompt_cache_retention`, and `tools` can be passed directly in provider options. Azure-only settings are used for client/request setup and are not forwarded in the JSON request body.

```ts
const result = await complete(
  model,
  {
    messages: [
      {
        role: 'user',
        id: 'user-1',
        content: [{ type: 'text', content: 'Plan a safe refactor for this module.' }],
      },
    ],
  },
  {
    apiKey: process.env.AZURE_OPENAI_API_KEY!,
    azureResourceName: 'my-resource',
    azureDeploymentName: 'prod-gpt-54',
    reasoning: {
      effort: 'medium',
      summary: 'auto',
    },
    max_output_tokens: 4000,
  },
  'msg-2'
);
```

Prior assistant messages from `azure-openai` are replayed as native Responses items, matching the built-in OpenAI provider.
