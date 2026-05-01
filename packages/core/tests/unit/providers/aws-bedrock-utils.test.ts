import { BedrockRuntimeClient } from '@aws-sdk/client-bedrock-runtime';
import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';

import {
  buildBedrockMessages,
  buildCommandInput,
  buildToolConfig,
  createClient,
} from '../../../src/providers/aws-bedrock/utils.js';

import type {
  AwsBedrockProviderOptions,
  BaseAssistantMessage,
  Context,
  Model,
  Tool,
} from '../../../src/types/index.js';

describe('AWS Bedrock Utils', () => {
  const mockModel: Model<'aws-bedrock'> = {
    id: 'anthropic.claude-sonnet-4-6',
    name: 'Claude Sonnet 4.6',
    api: 'aws-bedrock',
    baseUrl: '',
    reasoning: true,
    input: ['text', 'image', 'file'],
    cost: { input: 3, output: 15, cacheRead: 0.3, cacheWrite: 3.75 },
    contextWindow: 200000,
    maxTokens: 64000,
    tools: ['function_calling'],
  };

  const baseOptions: AwsBedrockProviderOptions = {
    region: 'us-east-1',
  };

  describe('createClient', () => {
    it('should create an AWS Bedrock client with region', async () => {
      const client = createClient(baseOptions);

      expect(client).toBeInstanceOf(BedrockRuntimeClient);
      expect(await client.config.region()).toBe('us-east-1');
    });

    it('should set credentials, profile, and endpoint when provided', async () => {
      const client = createClient({
        region: 'us-west-2',
        credentials: {
          accessKeyId: 'test-access-key',
          secretAccessKey: 'test-secret-key',
          sessionToken: 'test-session-token',
        },
        profile: 'dev-profile',
        endpoint: 'https://bedrock-runtime.example.com',
      });

      expect(client.config.profile).toBe('dev-profile');
      expect(await client.config.credentials()).toMatchObject({
        accessKeyId: 'test-access-key',
        secretAccessKey: 'test-secret-key',
        sessionToken: 'test-session-token',
      });
      expect(await client.config.region()).toBe('us-west-2');
      expect((await client.config.endpoint()).hostname).toBe('bedrock-runtime.example.com');
    });

    it('should register bearer token middleware when provided', () => {
      const client = createClient({
        region: 'us-east-1',
        bearerToken: 'bedrock-token',
      });

      expect(client.middlewareStack.identify()).toContain(
        'awsBedrockBearerTokenAuth - after awsAuthMiddleware'
      );
    });

    it('should use placeholder credentials for bearer token auth without SigV4 credentials', async () => {
      const client = createClient({
        region: 'us-east-1',
        bearerToken: 'bedrock-token',
      });

      expect(await client.config.credentials()).toMatchObject({
        accessKeyId: 'bearer-token-auth',
        secretAccessKey: 'bearer-token-auth',
      });
    });

    it('should throw when region is missing', () => {
      expect(() => createClient({ region: '' })).toThrow('AWS Bedrock region is required.');
    });
  });

  describe('buildCommandInput', () => {
    it('should send model.id as Bedrock modelId', () => {
      const result = buildCommandInput(mockModel, { messages: [] }, baseOptions);

      expect(result.modelId).toBe('anthropic.claude-sonnet-4-6');
    });

    it('should strip client-only options from command input', () => {
      const result = buildCommandInput(
        mockModel,
        { messages: [] },
        {
          ...baseOptions,
          profile: 'dev',
          endpoint: 'https://bedrock-runtime.example.com',
          bearerToken: 'token',
          inferenceConfig: { temperature: 0.2 },
        }
      );

      expect(result).not.toHaveProperty('region');
      expect(result).not.toHaveProperty('credentials');
      expect(result).not.toHaveProperty('profile');
      expect(result).not.toHaveProperty('endpoint');
      expect(result).not.toHaveProperty('bearerToken');
      expect(result.inferenceConfig).toEqual({ temperature: 0.2 });
    });

    it('should build user messages, system prompt, and cache points', () => {
      const result = buildCommandInput(
        mockModel,
        {
          systemPrompt: 'You are concise.',
          messages: [
            {
              role: 'user',
              id: 'user-1',
              content: [{ type: 'text', content: 'Hello' }],
            },
          ],
        },
        baseOptions
      );

      expect(result.system).toEqual([
        { text: 'You are concise.' },
        { cachePoint: { type: 'default' } },
      ]);
      expect(result.messages).toEqual([
        {
          role: 'user',
          content: [{ text: 'Hello' }, { cachePoint: { type: 'default' } }],
        },
      ]);
    });

    it('should add reasoning request fields for Claude models', () => {
      const result = buildCommandInput(
        mockModel,
        { messages: [] },
        {
          ...baseOptions,
          reasoning: 'xhigh',
          thinkingDisplay: 'omitted',
        }
      );

      expect(result.additionalModelRequestFields).toEqual({
        thinking: { type: 'adaptive', display: 'omitted' },
        output_config: { effort: 'xhigh' },
      });
    });

    it('should preserve native aws-bedrock assistant messages for replay', () => {
      const assistantMessage: BaseAssistantMessage<'aws-bedrock'> = {
        role: 'assistant',
        id: 'assistant-1',
        api: 'aws-bedrock',
        model: mockModel,
        message: {
          modelId: mockModel.id,
          content: [{ text: 'Hello from Bedrock' }],
        },
        content: [],
        usage: {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        },
        stopReason: 'stop',
        timestamp: Date.now(),
        duration: 1,
      };

      const result = buildBedrockMessages(mockModel, { messages: [assistantMessage] }, 'none');

      expect(result).toEqual([
        {
          role: 'assistant',
          content: [{ text: 'Hello from Bedrock' }],
        },
      ]);
    });

    it('should merge context tools and provider option tool config', () => {
      const contextTool: Tool = {
        name: 'search',
        description: 'Search',
        parameters: Type.Object({ query: Type.String() }),
      };

      const result = buildToolConfig([contextTool], 'any', {
        tools: [
          {
            toolSpec: {
              name: 'extra',
              description: 'Extra tool',
              inputSchema: { json: { type: 'object' } },
            },
          },
        ],
      });

      expect(result?.tools).toHaveLength(2);
      expect(result?.toolChoice).toEqual({ any: {} });
      expect(result?.tools?.[0]).toMatchObject({ toolSpec: { name: 'search' } });
      expect(result?.tools?.[1]).toMatchObject({ toolSpec: { name: 'extra' } });
    });
  });
});
