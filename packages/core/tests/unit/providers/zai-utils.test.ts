import { Type } from '@sinclair/typebox';
import OpenAI from 'openai';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildParams,
  buildZaiMessages,
  convertTools,
  createClient,
  getMockZaiMessage,
  mapStopReason,
} from '../../../src/providers/zai/utils.js';

import type {
  BaseAssistantMessage,
  Context,
  Model,
  Tool,
  ToolResultMessage,
  UserMessage,
} from '../../../src/types/index.js';
import type { ChatCompletion } from 'openai/resources/chat/completions.js';

describe('Z.AI Utils', () => {
  describe('createClient', () => {
    const originalEnv = { ...process.env };

    afterEach(() => {
      process.env = { ...originalEnv };
    });

    const mockModel: Model<'zai'> = {
      id: 'glm-5',
      name: 'GLM-5',
      api: 'zai',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      reasoning: true,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 131072,
      tools: ['function_calling'],
    };

    it('should create client with provided API key', () => {
      const client = createClient(mockModel, 'test-api-key', 'zai');
      expect(client).toBeInstanceOf(OpenAI);
    });

    it('should set baseURL from model', () => {
      const customModel: Model<'zai'> = {
        ...mockModel,
        baseUrl: 'https://custom.z.ai/api/v4',
      };
      const client = createClient(customModel, 'test-key', 'zai');
      expect(client.baseURL).toBe('https://custom.z.ai/api/v4');
    });

    it('should set custom headers from model', () => {
      const customModel: Model<'zai'> = {
        ...mockModel,
        headers: { 'X-Custom-Header': 'value' },
      };
      const client = createClient(customModel, 'test-key', 'zai');
      expect(client).toBeInstanceOf(OpenAI);
    });
  });

  describe('buildZaiMessages', () => {
    const mockModel: Model<'zai'> = {
      id: 'glm-5',
      name: 'GLM-5',
      api: 'zai',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      reasoning: true,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 131072,
      tools: ['function_calling'],
    };

    describe('system prompt', () => {
      it('should convert system prompt to system role', () => {
        const context: Context = {
          messages: [],
          systemPrompt: 'You are a helpful assistant',
        };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0]).toEqual({
          role: 'system',
          content: 'You are a helpful assistant',
        });
      });

      it('should not add system message when no system prompt', () => {
        const context: Context = {
          messages: [],
        };

        const result = buildZaiMessages(mockModel, context);
        expect(result.length).toBe(0);
      });

      it('should sanitize unicode in system prompt', () => {
        const unpaired = String.fromCharCode(0xd83d);
        const context: Context = {
          messages: [],
          systemPrompt: `Hello ${unpaired} World`,
        };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0].content).toBe('Hello  World');
      });
    });

    describe('user messages', () => {
      it('should convert user text to content string', () => {
        const userMessage: UserMessage = {
          role: 'user',
          id: 'msg-1',
          content: [{ type: 'text', content: 'Hello' }],
        };
        const context: Context = { messages: [userMessage] };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0]).toEqual({
          role: 'user',
          content: 'Hello',
        });
      });

      it('should concatenate multiple text contents', () => {
        const userMessage: UserMessage = {
          role: 'user',
          id: 'msg-1',
          content: [
            { type: 'text', content: 'Hello' },
            { type: 'text', content: 'World' },
          ],
        };
        const context: Context = { messages: [userMessage] };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0]).toEqual({
          role: 'user',
          content: 'Hello\nWorld',
        });
      });

      it('should sanitize unicode in text content', () => {
        const unpaired = String.fromCharCode(0xd83d);
        const userMessage: UserMessage = {
          role: 'user',
          id: 'msg-1',
          content: [{ type: 'text', content: `Hello ${unpaired} World` }],
        };
        const context: Context = { messages: [userMessage] };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0].content).toBe('Hello  World');
      });

      it('should skip non-text content types', () => {
        const userMessage: UserMessage = {
          role: 'user',
          id: 'msg-1',
          content: [
            { type: 'text', content: 'Hello' },
            { type: 'image', data: 'base64data', mimeType: 'image/png' },
          ],
        };
        const context: Context = { messages: [userMessage] };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0].content).toBe('Hello');
      });
    });

    describe('tool result messages', () => {
      it('should convert tool result to tool role message', () => {
        const toolResult: ToolResultMessage = {
          role: 'toolResult',
          id: 'result-1',
          toolCallId: 'call-1',
          toolName: 'search',
          content: [{ type: 'text', content: 'Result data' }],
          isError: false,
          timestamp: Date.now(),
        };
        const context: Context = { messages: [toolResult] };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0]).toEqual({
          role: 'tool',
          tool_call_id: 'call-1',
          content: 'Result data',
        });
      });

      it('should prefix error tool results with [TOOL ERROR]', () => {
        const toolResult: ToolResultMessage = {
          role: 'toolResult',
          id: 'result-1',
          toolCallId: 'call-1',
          toolName: 'search',
          content: [{ type: 'text', content: 'Something went wrong' }],
          isError: true,
          timestamp: Date.now(),
        };
        const context: Context = { messages: [toolResult] };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0].content).toBe('[TOOL ERROR] Something went wrong');
      });

      it('should handle empty tool results', () => {
        const toolResult: ToolResultMessage = {
          role: 'toolResult',
          id: 'result-1',
          toolCallId: 'call-1',
          toolName: 'search',
          content: [],
          isError: false,
          timestamp: Date.now(),
        };
        const context: Context = { messages: [toolResult] };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0]).toEqual({
          role: 'tool',
          tool_call_id: 'call-1',
          content: '',
        });
      });

      it('should handle error tool results with no content', () => {
        const toolResult: ToolResultMessage = {
          role: 'toolResult',
          id: 'result-1',
          toolCallId: 'call-1',
          toolName: 'search',
          content: [],
          isError: true,
          timestamp: Date.now(),
        };
        const context: Context = { messages: [toolResult] };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0].content).toBe('[TOOL ERROR]');
      });
    });

    describe('assistant messages', () => {
      it('should convert Z.AI assistant messages (preserves native)', () => {
        const mockChatCompletion: any = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'glm-5',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'Hello from Z.AI!',
              },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };

        const assistantMessage: BaseAssistantMessage<'zai'> = {
          role: 'assistant',
          id: 'msg-1',
          api: 'zai',
          model: mockModel,
          timestamp: Date.now(),
          duration: 100,
          stopReason: 'stop',
          content: [{ type: 'response', response: [{ type: 'text', content: 'Hello from Z.AI!' }] }],
          usage: {
            input: 10,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 15,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          message: mockChatCompletion,
        };
        const context: Context = { messages: [assistantMessage] };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0]).toEqual({
          role: 'assistant',
          content: 'Hello from Z.AI!',
        });
      });

      it('should preserve reasoning_content for native Z.AI messages (preserved thinking)', () => {
        const mockChatCompletion: any = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'glm-5',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: 'The answer is 42.',
                reasoning_content: 'Let me think step by step...',
              },
              finish_reason: 'stop',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };

        const assistantMessage: BaseAssistantMessage<'zai'> = {
          role: 'assistant',
          id: 'msg-1',
          api: 'zai',
          model: mockModel,
          timestamp: Date.now(),
          duration: 100,
          stopReason: 'stop',
          content: [
            { type: 'thinking', thinkingText: 'Let me think step by step...' },
            { type: 'response', response: [{ type: 'text', content: 'The answer is 42.' }] },
          ],
          usage: {
            input: 10,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 15,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          message: mockChatCompletion,
        };
        const context: Context = { messages: [assistantMessage] };

        const result = buildZaiMessages(mockModel, context);
        // Native messages preserve reasoning_content
        expect(result[0]).toEqual({
          role: 'assistant',
          content: 'The answer is 42.',
          reasoning_content: 'Let me think step by step...',
        });
      });

      it('should handle assistant messages with tool calls', () => {
        const mockChatCompletion: any = {
          id: 'chatcmpl-123',
          object: 'chat.completion',
          created: Date.now(),
          model: 'glm-5',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call-123',
                    type: 'function',
                    function: {
                      name: 'search',
                      arguments: '{"query": "test"}',
                    },
                  },
                ],
              },
              finish_reason: 'tool_calls',
              logprobs: null,
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        };

        const assistantMessage: BaseAssistantMessage<'zai'> = {
          role: 'assistant',
          id: 'msg-1',
          api: 'zai',
          model: mockModel,
          timestamp: Date.now(),
          duration: 100,
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              toolCallId: 'call-123',
              name: 'search',
              arguments: { query: 'test' },
            },
          ],
          usage: {
            input: 10,
            output: 5,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 15,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          message: mockChatCompletion,
        };
        const context: Context = { messages: [assistantMessage] };

        const result = buildZaiMessages(mockModel, context);
        expect(result[0]).toEqual({
          role: 'assistant',
          content: null,
          tool_calls: [
            {
              id: 'call-123',
              type: 'function',
              function: {
                name: 'search',
                arguments: '{"query": "test"}',
              },
            },
          ],
        });
      });

      describe('cross-provider handoff', () => {
        it('should convert Google assistant text response to Z.AI format', () => {
          const assistantMessage: BaseAssistantMessage<'google'> = {
            role: 'assistant',
            id: 'msg-1',
            api: 'google',
            model: { id: 'gemini-2.0-flash', api: 'google' } as any,
            timestamp: Date.now(),
            duration: 100,
            stopReason: 'stop',
            content: [
              {
                type: 'response',
                response: [{ type: 'text', content: 'Hello from Gemini!' }],
              },
            ],
            usage: {
              input: 10,
              output: 20,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 30,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            message: {} as any,
          };
          const context: Context = { messages: [assistantMessage as any] };

          const result = buildZaiMessages(mockModel, context);
          expect(result[0]).toEqual({
            role: 'assistant',
            content: 'Hello from Gemini!',
            reasoning_content: undefined,
          });
        });

        it('should convert cross-provider thinking to reasoning_content', () => {
          const assistantMessage: BaseAssistantMessage<'google'> = {
            role: 'assistant',
            id: 'msg-1',
            api: 'google',
            model: { id: 'gemini-2.0-flash-thinking', api: 'google' } as any,
            timestamp: Date.now(),
            duration: 100,
            stopReason: 'stop',
            content: [
              {
                type: 'thinking',
                thinkingText: 'Let me analyze this...',
              },
              {
                type: 'response',
                response: [{ type: 'text', content: 'The answer is 42.' }],
              },
            ],
            usage: {
              input: 10,
              output: 20,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 30,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            message: {} as any,
          };
          const context: Context = { messages: [assistantMessage as any] };

          const result = buildZaiMessages(mockModel, context);
          expect(result[0]).toEqual({
            role: 'assistant',
            reasoning_content: 'Let me analyze this...',
            content: 'The answer is 42.',
          });
        });

        it('should convert cross-provider tool calls to Z.AI format', () => {
          const assistantMessage: BaseAssistantMessage<'google'> = {
            role: 'assistant',
            id: 'msg-1',
            api: 'google',
            model: { id: 'gemini-2.0-flash', api: 'google' } as any,
            timestamp: Date.now(),
            duration: 100,
            stopReason: 'toolUse',
            content: [
              {
                type: 'toolCall',
                toolCallId: 'call-123',
                name: 'get_weather',
                arguments: { location: 'San Francisco' },
              },
            ],
            usage: {
              input: 10,
              output: 20,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 30,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            message: {} as any,
          };
          const context: Context = { messages: [assistantMessage as any] };

          const result = buildZaiMessages(mockModel, context);
          expect(result[0]).toEqual({
            role: 'assistant',
            content: null,
            reasoning_content: undefined,
            tool_calls: [
              {
                id: 'call-123',
                type: 'function',
                function: {
                  name: 'get_weather',
                  arguments: '{"location":"San Francisco"}',
                },
              },
            ],
          });
        });

        it('should sanitize unicode in cross-provider messages', () => {
          const unpaired = String.fromCharCode(0xd83d);
          const assistantMessage: BaseAssistantMessage<'google'> = {
            role: 'assistant',
            id: 'msg-1',
            api: 'google',
            model: { id: 'gemini-2.0-flash', api: 'google' } as any,
            timestamp: Date.now(),
            duration: 100,
            stopReason: 'stop',
            content: [
              {
                type: 'response',
                response: [{ type: 'text', content: `Hello ${unpaired} World` }],
              },
            ],
            usage: {
              input: 10,
              output: 20,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 30,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            message: {} as any,
          };
          const context: Context = { messages: [assistantMessage as any] };

          const result = buildZaiMessages(mockModel, context);
          expect(result[0].content).toBe('Hello  World');
        });
      });
    });
  });

  describe('buildParams', () => {
    const mockModel: Model<'zai'> = {
      id: 'glm-5',
      name: 'GLM-4.7',
      api: 'zai',
      baseUrl: 'https://api.z.ai/api/paas/v4',
      reasoning: true,
      input: ['text'],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 200000,
      maxTokens: 131072,
      tools: ['function_calling'],
    };

    it('should set model ID', () => {
      const context: Context = { messages: [] };
      const options = { apiKey: 'test', signal: undefined };

      const result = buildParams(mockModel, context, options);
      expect(result.model).toBe('glm-5');
    });

    it('should set stream to false', () => {
      const context: Context = { messages: [] };
      const options = { apiKey: 'test', signal: undefined };

      const result = buildParams(mockModel, context, options);
      expect(result.stream).toBe(false);
    });

    it('should add thinking config with type enabled by default for reasoning models', () => {
      const context: Context = { messages: [] };
      const options = { apiKey: 'test', signal: undefined };

      const result = buildParams(mockModel, context, options) as any;
      expect(result.thinking).toEqual({ type: 'enabled' });
    });

    it('should pass through custom thinking config', () => {
      const context: Context = { messages: [] };
      const options = {
        apiKey: 'test',
        signal: undefined,
        thinking: { type: 'enabled' as const, clear_thinking: false },
      };

      const result = buildParams(mockModel, context, options) as any;
      expect(result.thinking).toEqual({ type: 'enabled', clear_thinking: false });
    });

    it('should allow disabling thinking', () => {
      const context: Context = { messages: [] };
      const options = {
        apiKey: 'test',
        signal: undefined,
        thinking: { type: 'disabled' as const },
      };

      const result = buildParams(mockModel, context, options) as any;
      expect(result.thinking).toEqual({ type: 'disabled' });
    });

    it('should convert tools when model supports function_calling', () => {
      const tool: Tool = {
        name: 'search',
        description: 'Search the web',
        parameters: Type.Object({ query: Type.String() }),
      };
      const context: Context = { messages: [], tools: [tool] };
      const options = { apiKey: 'test', signal: undefined };

      const result = buildParams(mockModel, context, options);
      expect(result.tools).toBeDefined();
      expect(result.tools?.length).toBeGreaterThan(0);
    });

    it('should not add tools when model does not support function_calling', () => {
      const modelNoTools: Model<'zai'> = {
        ...mockModel,
        tools: [],
      };
      const tool: Tool = {
        name: 'search',
        description: 'Search the web',
        parameters: Type.Object({ query: Type.String() }),
      };
      const context: Context = { messages: [], tools: [tool] };
      const options = { apiKey: 'test', signal: undefined };

      const result = buildParams(modelNoTools, context, options);
      expect(result.tools).toBeUndefined();
    });

    it('should merge provider option tools', () => {
      const contextTool: Tool = {
        name: 'search',
        description: 'Search',
        parameters: Type.Object({}),
      };
      const optionTool = {
        type: 'function' as const,
        function: {
          name: 'extra',
          description: 'Extra tool',
          parameters: {},
        },
      };
      const context: Context = { messages: [], tools: [contextTool] };
      const options = { apiKey: 'test', signal: undefined, tools: [optionTool] };

      const result = buildParams(mockModel, context, options);
      expect(result.tools?.length).toBe(2);
    });

    it('should pass through other options', () => {
      const context: Context = { messages: [] };
      const options = {
        apiKey: 'test',
        signal: undefined,
        temperature: 0.7,
        max_tokens: 2000,
      } as any;

      const result = buildParams(mockModel, context, options);
      expect(result.temperature).toBe(0.7);
      expect(result.max_tokens).toBe(2000);
    });

    it('should not include apiKey or signal in params', () => {
      const context: Context = { messages: [] };
      const options = { apiKey: 'test-key', signal: new AbortController().signal };

      const result = buildParams(mockModel, context, options);
      expect(result).not.toHaveProperty('apiKey');
      expect(result).not.toHaveProperty('signal');
    });
  });

  describe('convertTools', () => {
    it('should convert TypeBox schema to chat completion format', () => {
      const tool: Tool = {
        name: 'search',
        description: 'Search the web',
        parameters: Type.Object({
          query: Type.String(),
          limit: Type.Number(),
        }),
      };

      const result = convertTools([tool]);
      expect(result[0]).toEqual({
        type: 'function',
        function: {
          name: 'search',
          description: 'Search the web',
          parameters: tool.parameters,
        },
      });
    });

    it('should convert multiple tools', () => {
      const tools: Tool[] = [
        { name: 'tool1', description: 'First', parameters: Type.Object({}) },
        { name: 'tool2', description: 'Second', parameters: Type.Object({}) },
      ];

      const result = convertTools(tools);
      expect(result.length).toBe(2);
      expect((result[0] as any).function.name).toBe('tool1');
      expect((result[1] as any).function.name).toBe('tool2');
    });
  });

  describe('mapStopReason', () => {
    it('should map stop to stop', () => {
      expect(mapStopReason('stop')).toBe('stop');
    });

    it('should map length to length', () => {
      expect(mapStopReason('length')).toBe('length');
    });

    it('should map tool_calls to toolUse', () => {
      expect(mapStopReason('tool_calls')).toBe('toolUse');
    });

    it('should map content_filter to error', () => {
      expect(mapStopReason('content_filter')).toBe('error');
    });

    it('should map sensitive to error (Z.AI-specific)', () => {
      expect(mapStopReason('sensitive')).toBe('error');
    });

    it('should map network_error to error (Z.AI-specific)', () => {
      expect(mapStopReason('network_error')).toBe('error');
    });

    it('should return stop for null', () => {
      expect(mapStopReason(null)).toBe('stop');
    });

    it('should return stop for undefined', () => {
      expect(mapStopReason(undefined)).toBe('stop');
    });

    it('should return stop for unknown values', () => {
      expect(mapStopReason('unknown_reason')).toBe('stop');
    });
  });

  describe('getMockZaiMessage', () => {
    it('should return a valid ChatCompletion structure', () => {
      const mock = getMockZaiMessage('glm-5', 'test-req-123');
      expect(mock.id).toBe('chatcmpl-test-req-123');
      expect(mock.object).toBe('chat.completion');
      expect(mock.model).toBe('glm-5');
      expect(mock.choices).toBeDefined();
      expect(mock.choices.length).toBe(1);
      expect(mock.choices[0].message.role).toBe('assistant');
    });

    it('should have empty content', () => {
      const mock = getMockZaiMessage('glm-5', 'test-req-123');
      expect(mock.choices[0].message.content).toBe('');
    });

    it('should have zero usage', () => {
      const mock = getMockZaiMessage('glm-5', 'test-req-123');
      expect(mock.usage?.prompt_tokens).toBe(0);
      expect(mock.usage?.completion_tokens).toBe(0);
      expect(mock.usage?.total_tokens).toBe(0);
    });
  });
});
