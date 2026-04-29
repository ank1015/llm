import { beforeAll, expect, it } from 'vitest';

import { getModel } from '../../../src/models/index.js';
import { streamAwsBedrock } from '../../../src/providers/aws-bedrock/stream.js';
import {
  collectStreamEvents,
  describeIfAvailable,
  getAssistantText,
  getIntegrationEnv,
} from '../helpers/live.js';

import type {
  AwsBedrockProviderOptions,
  BaseAssistantEvent,
  Context,
  Model,
} from '../../../src/types/index.js';

const region = getIntegrationEnv('AWS_BEDROCK_REGION') ?? getIntegrationEnv('AWS_REGION');
const profile = getIntegrationEnv('AWS_BEDROCK_PROFILE');
const bearerToken = getIntegrationEnv('AWS_BEARER_TOKEN_BEDROCK');
const hasStaticCredentials = Boolean(
  getIntegrationEnv('AWS_ACCESS_KEY_ID') && getIntegrationEnv('AWS_SECRET_ACCESS_KEY')
);
const modelId =
  getIntegrationEnv('AWS_BEDROCK_MODEL_ID') ?? 'anthropic.claude-haiku-4-5-20251001-v1:0';
const describeIfAwsBedrock = describeIfAvailable(
  Boolean(region && (profile || bearerToken || hasStaticCredentials))
);

describeIfAwsBedrock('AWS Bedrock Stream Integration', () => {
  let model: Model<'aws-bedrock'>;

  beforeAll(() => {
    const catalogModel = getModel('aws-bedrock', modelId);
    if (!catalogModel) {
      throw new Error(`Test model ${modelId} not found`);
    }
    model = catalogModel;
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
    const options: AwsBedrockProviderOptions = {
      region: region!,
      ...(profile ? { profile } : {}),
      ...(bearerToken ? { bearerToken } : {}),
      inferenceConfig: {
        maxTokens: 64,
        temperature: 0,
      },
    };

    const assistantStream = streamAwsBedrock(model, context, options, 'aws-bedrock-test-msg-1');
    const events = await collectStreamEvents<BaseAssistantEvent<'aws-bedrock'>>(assistantStream);
    const result = await assistantStream.result();

    expect(events.length).toBeGreaterThan(0);
    expect(events[0].type).toBe('start');
    expect(events[events.length - 1].type).toBe('done');
    expect(result.api).toBe('aws-bedrock');
    expect(result.model.id).toBe(modelId);
    expect(result.message.modelId).toBe(modelId);
    expect(getAssistantText(result).toLowerCase()).toContain('hello');
  }, 30000);
});
