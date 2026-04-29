import { beforeAll, expect, it } from 'vitest';

import { getModel } from '../../../src/models/index.js';
import { streamAzureOpenAI } from '../../../src/providers/azure-openai/stream.js';
import {
  collectStreamEvents,
  describeIfAvailable,
  getAssistantText,
  getIntegrationEnv,
} from '../helpers/live.js';

import type {
  AzureOpenAIProviderOptions,
  BaseAssistantEvent,
  Context,
  Model,
} from '../../../src/types/index.js';

const apiKey = getIntegrationEnv('AZURE_OPENAI_API_KEY');
const azureBaseURL = getIntegrationEnv('AZURE_OPENAI_BASE_URL');
const azureResourceName = getIntegrationEnv('AZURE_OPENAI_RESOURCE_NAME');
const azureDeploymentName = getIntegrationEnv('AZURE_OPENAI_DEPLOYMENT_NAME');
const azureApiVersion = getIntegrationEnv('AZURE_OPENAI_API_VERSION') ?? 'v1';
const describeIfAzureOpenAI = describeIfAvailable(
  Boolean(apiKey && (azureBaseURL || azureResourceName) && azureDeploymentName)
);

describeIfAzureOpenAI('Azure OpenAI Stream Integration', () => {
  let model: Model<'azure-openai'>;
  const testModelId = 'gpt-5.4-nano' as const;

  beforeAll(() => {
    const testModel = getModel('azure-openai', testModelId);
    if (!testModel) {
      throw new Error(`Test model ${testModelId} not found`);
    }
    model = testModel;
  });

  it('should stream completed text', async () => {
    const context: Context = {
      messages: [
        {
          role: 'user',
          id: 'test-1',
          content: [{ type: 'text', content: 'Say "hello"' }],
        },
      ],
    };
    const options: AzureOpenAIProviderOptions = {
      apiKey: apiKey!,
      azureApiVersion,
      azureDeploymentName: azureDeploymentName!,
      ...(azureBaseURL ? { azureBaseURL } : { azureResourceName: azureResourceName! }),
    };

    const assistantStream = streamAzureOpenAI(model, context, options, 'azure-test-msg-1');
    const events = await collectStreamEvents<BaseAssistantEvent<'azure-openai'>>(assistantStream);
    const result = await assistantStream.result();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('start');
    expect(events[events.length - 1].type).toBe('done');
    expect(result.api).toBe('azure-openai');
    expect(result.model.id).toBe('gpt-5.4-nano');
    expect(result.message.status).toBe('completed');
    expect(getAssistantText(result).toLowerCase()).toContain('hello');
  }, 30000);
});
