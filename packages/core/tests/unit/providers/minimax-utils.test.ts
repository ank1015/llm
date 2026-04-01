import Anthropic from '@anthropic-ai/sdk';
import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';

import {
  buildMinimaxMessages,
  buildParams,
  createClient,
  mapStopReason,
} from '../../../src/providers/minimax/utils.js';

import type {
  BaseAssistantMessage,
  Context,
  MiniMaxProviderOptions,
  Model,
  Tool,
  ToolResultMessage,
  UserMessage,
} from '../../../src/types/index.js';
import type { Message as AnthropicMessage } from '@anthropic-ai/sdk/resources/messages.js';

describe('MiniMax Utils', () => {
  describe('createClient', () => {
    const mockModel: Model<'minimax'> = {
      id: 'MiniMax-M2.5',
      name: 'MiniMax M2.5',
      api: 'minimax',
      baseUrl: 'https://api.minimax.io/anthropic',
      reasoning: true,
      input: ['text'],
      cost: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.375 },
      contextWindow: 204800,
      maxTokens: 64000,
      tools: ['function_calling'],
    };

    it('should create client with provided API key', () => {
      const client = createClient(mockModel, 'test-api-key');
      expect(client).toBeInstanceOf(Anthropic);
    });

    it('should throw when API key is missing', () => {
      expect(() => createClient(mockModel, '')).toThrow('MiniMax API key is required.');
    });

    it('should set baseURL from model', () => {
      const client = createClient(mockModel, 'test-key');
      expect(client.baseURL).toBe('https://api.minimax.io/anthropic');
    });

    it('should set custom headers from model', () => {
      const customModel: Model<'minimax'> = {
        ...mockModel,
        headers: { 'X-Custom-Header': 'value' },
      };
      const client = createClient(customModel, 'test-key');
      expect(client).toBeInstanceOf(Anthropic);
    });
  });

  describe('buildMinimaxMessages', () => {
    const mockModel: Model<'minimax'> = {
      id: 'MiniMax-M2.5',
      name: 'MiniMax M2.5',
      api: 'minimax',
      baseUrl: 'https://api.minimax.io/anthropic',
      reasoning: true,
      input: ['text'],
      cost: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.375 },
      contextWindow: 204800,
      maxTokens: 64000,
      tools: ['function_calling'],
    };

    describe('user messages', () => {
      it('should convert user text to text block', () => {
        const userMessage: UserMessage = {
          role: 'user',
          id: 'msg-1',
          content: [{ type: 'text', content: 'Hello MiniMax' }],
        };
        const context: Context = { messages: [userMessage] };

        const result = buildMinimaxMessages(mockModel, context);
        expect(result[0]).toEqual({
          role: 'user',
          content: [{ type: 'text', text: 'Hello MiniMax' }],
        });
      });

      it('should skip image content (MiniMax does not support images)', () => {
        const userMessage: UserMessage = {
          role: 'user',
          id: 'msg-1',
          content: [
            { type: 'text', content: 'What is this?' },
            { type: 'image', data: 'base64data', mimeType: 'image/png' },
          ],
        };
        const context: Context = { messages: [userMessage] };

        const result = buildMinimaxMessages(mockModel, context);
        expect((result[0] as any).content).toEqual([{ type: 'text', text: 'What is this?' }]);
      });

      it('should sanitize unicode in text content', () => {
        const unpaired = String.fromCharCode(0xd83d);
        const userMessage: UserMessage = {
          role: 'user',
          id: 'msg-1',
          content: [{ type: 'text', content: `Hello ${unpaired} World` }],
        };
        const context: Context = { messages: [userMessage] };

        const result = buildMinimaxMessages(mockModel, context);
        expect((result[0] as any).content[0].text).toBe('Hello  World');
      });

      it('should handle multiple content items', () => {
        const userMessage: UserMessage = {
          role: 'user',
          id: 'msg-1',
          content: [
            { type: 'text', content: 'First' },
            { type: 'text', content: 'Second' },
          ],
        };
        const context: Context = { messages: [userMessage] };

        const result = buildMinimaxMessages(mockModel, context);
        expect((result[0] as any).content.length).toBe(2);
      });
    });

    describe('tool result messages', () => {
      it('should convert tool result to tool_result block', () => {
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

        const result = buildMinimaxMessages(mockModel, context);
        expect(result[0]).toEqual({
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call-1',
              content: 'Result data',
              is_error: false,
            },
          ],
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

        const result = buildMinimaxMessages(mockModel, context);
        expect((result[0] as any).content[0].content).toBe('[TOOL ERROR] Something went wrong');
        expect((result[0] as any).content[0].is_error).toBe(true);
      });

      it('should handle empty tool result content', () => {
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

        const result = buildMinimaxMessages(mockModel, context);
        expect((result[0] as any).content[0].content).toBe('');
      });

      it('should add error placeholder for empty error results', () => {
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

        const result = buildMinimaxMessages(mockModel, context);
        expect((result[0] as any).content[0].content).toBe('[TOOL ERROR]');
      });

      it('should combine multiple text content items', () => {
        const toolResult: ToolResultMessage = {
          role: 'toolResult',
          id: 'result-1',
          toolCallId: 'call-1',
          toolName: 'search',
          content: [
            { type: 'text', content: 'First' },
            { type: 'text', content: 'Second' },
          ],
          isError: false,
          timestamp: Date.now(),
        };
        const context: Context = { messages: [toolResult] };

        const result = buildMinimaxMessages(mockModel, context);
        expect((result[0] as any).content[0].content).toBe('First\nSecond');
      });
    });

    describe('assistant messages', () => {
      it('should preserve native MiniMax assistant messages', () => {
        const assistantMessage: BaseAssistantMessage<'minimax'> = {
          role: 'assistant',
          id: 'msg-1',
          api: 'minimax',
          model: mockModel,
          timestamp: Date.now(),
          duration: 100,
          stopReason: 'stop',
          content: [],
          usage: {
            input: 10,
            output: 20,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 30,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          message: {
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello' }],
            model: 'MiniMax-M2.5',
            stop_reason: 'end_turn',
            stop_sequence: null,
            usage: {
              input_tokens: 10,
              output_tokens: 20,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          } as AnthropicMessage,
        };
        const context: Context = { messages: [assistantMessage] };

        const result = buildMinimaxMessages(mockModel, context);
        expect(result[0]).toEqual({
          role: 'assistant',
          content: [{ type: 'text', text: 'Hello' }],
        });
      });

      it('should handle tool_use in native assistant messages', () => {
        const assistantMessage: BaseAssistantMessage<'minimax'> = {
          role: 'assistant',
          id: 'msg-1',
          api: 'minimax',
          model: mockModel,
          timestamp: Date.now(),
          duration: 100,
          stopReason: 'toolUse',
          content: [],
          usage: {
            input: 10,
            output: 20,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 30,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          message: {
            id: 'msg-1',
            type: 'message',
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call-1',
                name: 'get_weather',
                input: { location: 'San Francisco' },
              },
            ],
            model: 'MiniMax-M2.5',
            stop_reason: 'tool_use',
            stop_sequence: null,
            usage: {
              input_tokens: 10,
              output_tokens: 20,
              cache_creation_input_tokens: 0,
              cache_read_input_tokens: 0,
            },
          } as AnthropicMessage,
        };
        const context: Context = { messages: [assistantMessage] };

        const result = buildMinimaxMessages(mockModel, context);
        expect(result[0]).toEqual({
          role: 'assistant',
          content: [
            {
              type: 'tool_use',
              id: 'call-1',
              name: 'get_weather',
              input: { location: 'San Francisco' },
            },
          ],
        });
      });

      describe('cross-provider handoff', () => {
        it('should convert OpenAI assistant text response to MiniMax format', () => {
          const assistantMessage: BaseAssistantMessage<'openai'> = {
            role: 'assistant',
            id: 'msg-1',
            api: 'openai',
            model: { id: 'gpt-4', api: 'openai' } as any,
            timestamp: Date.now(),
            duration: 100,
            stopReason: 'stop',
            content: [
              {
                type: 'response',
                response: [{ type: 'text', content: 'Hello from GPT!' }],
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

          const result = buildMinimaxMessages(mockModel, context);
          expect(result[0]).toEqual({
            role: 'assistant',
            content: [{ type: 'text', text: 'Hello from GPT!' }],
          });
        });

        it('should convert thinking content to thinking tags', () => {
          const assistantMessage: BaseAssistantMessage<'openai'> = {
            role: 'assistant',
            id: 'msg-1',
            api: 'openai',
            model: { id: 'gpt-5', api: 'openai' } as any,
            timestamp: Date.now(),
            duration: 100,
            stopReason: 'stop',
            content: [
              {
                type: 'thinking',
                thinkingText: 'Let me analyze this problem...',
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

          const result = buildMinimaxMessages(mockModel, context);
          expect(result[0]).toEqual({
            role: 'assistant',
            content: [
              { type: 'text', text: '<thinking>Let me analyze this problem...</thinking>' },
              { type: 'text', text: 'The answer is 42.' },
            ],
          });
        });

        it('should convert cross-provider tool calls', () => {
          const assistantMessage: BaseAssistantMessage<'google'> = {
            role: 'assistant',
            id: 'msg-1',
            api: 'google',
            model: { id: 'gemini-3-pro', api: 'google' } as any,
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

          const result = buildMinimaxMessages(mockModel, context);
          expect(result[0]).toEqual({
            role: 'assistant',
            content: [
              {
                type: 'tool_use',
                id: 'call-123',
                name: 'get_weather',
                input: { location: 'San Francisco' },
              },
            ],
          });
        });

        it('should handle mixed content from cross-provider messages', () => {
          const assistantMessage: BaseAssistantMessage<'google'> = {
            role: 'assistant',
            id: 'msg-1',
            api: 'google',
            model: { id: 'gemini-3-pro', api: 'google' } as any,
            timestamp: Date.now(),
            duration: 100,
            stopReason: 'toolUse',
            content: [
              {
                type: 'response',
                response: [{ type: 'text', content: 'I will search for that.' }],
              },
              {
                type: 'toolCall',
                toolCallId: 'call-456',
                name: 'search',
                arguments: { query: 'test' },
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

          const result = buildMinimaxMessages(mockModel, context);
          expect(result.length).toBe(1);
          expect((result[0] as any).content.length).toBe(2);
          expect((result[0] as any).content[0].type).toBe('text');
          expect((result[0] as any).content[1].type).toBe('tool_use');
        });

        it('should sanitize unicode in cross-provider messages', () => {
          const unpaired = String.fromCharCode(0xd83d);
          const assistantMessage: BaseAssistantMessage<'google'> = {
            role: 'assistant',
            id: 'msg-1',
            api: 'google',
            model: { id: 'gemini-3-pro', api: 'google' } as any,
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

          const result = buildMinimaxMessages(mockModel, context);
          expect((result[0] as any).content[0].text).toBe('Hello  World');
        });

        it('should skip empty text responses from cross-provider messages', () => {
          const assistantMessage: BaseAssistantMessage<'google'> = {
            role: 'assistant',
            id: 'msg-1',
            api: 'google',
            model: { id: 'gemini-3-pro', api: 'google' } as any,
            timestamp: Date.now(),
            duration: 100,
            stopReason: 'stop',
            content: [
              {
                type: 'response',
                response: [{ type: 'text', content: '' }],
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

          const result = buildMinimaxMessages(mockModel, context);
          expect(result.length).toBe(0);
        });
      });
    });
  });

  describe('buildParams', () => {
    const mockModel: Model<'minimax'> = {
      id: 'MiniMax-M2.5',
      name: 'MiniMax M2.5',
      api: 'minimax',
      baseUrl: 'https://api.minimax.io/anthropic',
      reasoning: true,
      input: ['text'],
      cost: { input: 0.3, output: 1.2, cacheRead: 0.03, cacheWrite: 0.375 },
      contextWindow: 204800,
      maxTokens: 64000,
      tools: ['function_calling'],
    };

    it('should set model ID', () => {
      const context: Context = { messages: [] };
      const options: MiniMaxProviderOptions = {
        apiKey: 'test',
        signal: undefined,
        max_tokens: 8000,
      };

      const result = buildParams(mockModel, context, options);
      expect(result.model).toBe('MiniMax-M2.5');
    });

    it('should set stream to false', () => {
      const context: Context = { messages: [] };
      const options = { apiKey: 'test', signal: undefined, max_tokens: 8000 };

      const result = buildParams(mockModel, context, options);
      expect(result.stream).toBe(false);
    });

    it('should set max_tokens from model when not provided', () => {
      const context: Context = { messages: [] };
      const options = { apiKey: 'test', signal: undefined };

      const result = buildParams(mockModel, context, options);
      expect(result.max_tokens).toBe(64000);
    });

    it('should use custom max_tokens if provided', () => {
      const context: Context = { messages: [] };
      const options = { apiKey: 'test', signal: undefined, max_tokens: 1000 };

      const result = buildParams(mockModel, context, options);
      expect(result.max_tokens).toBe(1000);
    });

    it('should add system prompt with cache control', () => {
      const context: Context = {
        messages: [],
        systemPrompt: 'You are a helpful assistant',
      };
      const options = { apiKey: 'test', signal: undefined, max_tokens: 8000 };

      const result = buildParams(mockModel, context, options);
      expect(result.system).toEqual([
        {
          type: 'text',
          text: 'You are a helpful assistant',
          cache_control: { type: 'ephemeral' },
        },
      ]);
    });

    it('should not set system when no system prompt', () => {
      const context: Context = { messages: [] };
      const options = { apiKey: 'test', signal: undefined, max_tokens: 8000 };

      const result = buildParams(mockModel, context, options);
      expect(result.system).toBeUndefined();
    });

    it('should convert tools when model supports function_calling', () => {
      const tool: Tool = {
        name: 'search',
        description: 'Search the web',
        parameters: Type.Object({ query: Type.String() }),
      };
      const context: Context = { messages: [], tools: [tool] };
      const options = { apiKey: 'test', signal: undefined, max_tokens: 8000 };

      const result = buildParams(mockModel, context, options);
      expect(result.tools).toBeDefined();
      expect(result.tools?.length).toBeGreaterThan(0);
    });

    it('should not add tools when model does not support function_calling', () => {
      const modelNoTools: Model<'minimax'> = {
        ...mockModel,
        tools: [],
      };
      const tool: Tool = {
        name: 'search',
        description: 'Search the web',
        parameters: Type.Object({ query: Type.String() }),
      };
      const context: Context = { messages: [], tools: [tool] };
      const options = { apiKey: 'test', signal: undefined, max_tokens: 8000 };

      const result = buildParams(modelNoTools, context, options);
      expect(result.tools).toBeUndefined();
    });

    it('should pass through other options', () => {
      const context: Context = { messages: [] };
      const options = {
        apiKey: 'test',
        signal: undefined,
        temperature: 0.7,
        top_p: 0.9,
      } as any;

      const result = buildParams(mockModel, context, options);
      expect(result.temperature).toBe(0.7);
      expect(result.top_p).toBe(0.9);
    });

    it('should not include apiKey or signal in params', () => {
      const context: Context = { messages: [] };
      const options = {
        apiKey: 'test-key',
        signal: new AbortController().signal,
        max_tokens: 8000,
      };

      const result = buildParams(mockModel, context, options);
      expect(result).not.toHaveProperty('apiKey');
      expect(result).not.toHaveProperty('signal');
    });

    it('should sanitize unicode in system prompt', () => {
      const unpaired = String.fromCharCode(0xd83d);
      const context: Context = {
        messages: [],
        systemPrompt: `Hello ${unpaired} World`,
      };
      const options = { apiKey: 'test', signal: undefined, max_tokens: 8000 };

      const result = buildParams(mockModel, context, options);
      expect((result.system as any)[0].text).toBe('Hello  World');
    });
  });

  describe('mapStopReason', () => {
    it('should map end_turn to stop', () => {
      expect(mapStopReason('end_turn')).toBe('stop');
    });

    it('should map max_tokens to length', () => {
      expect(mapStopReason('max_tokens')).toBe('length');
    });

    it('should map tool_use to toolUse', () => {
      expect(mapStopReason('tool_use')).toBe('toolUse');
    });

    it('should map refusal to error', () => {
      expect(mapStopReason('refusal')).toBe('error');
    });

    it('should map pause_turn to stop', () => {
      expect(mapStopReason('pause_turn')).toBe('stop');
    });

    it('should map stop_sequence to stop', () => {
      expect(mapStopReason('stop_sequence')).toBe('stop');
    });

    it('should map unknown reasons to stop', () => {
      expect(mapStopReason('unknown_reason')).toBe('stop');
    });
  });
});
