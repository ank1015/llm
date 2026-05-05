import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';

import { streamOpenAIResponses } from '../../../src/providers/openai/responses-stream.js';
import { getMockOpenaiMessage } from '../../../src/providers/openai/utils.js';

import type { Context, Model, Tool } from '../../../src/types/index.js';
import type {
  Response,
  ResponseCreateParamsNonStreaming,
  ResponseStreamEvent,
} from 'openai/resources/responses/responses.js';

describe('OpenAI Responses stream', () => {
  const model: Model<'openai'> = {
    id: 'gpt-4',
    name: 'GPT-4',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    reasoning: false,
    input: ['text'],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
    tools: ['function_calling'],
  };

  const applyPatchTool: Tool = {
    name: 'apply_patch',
    description: 'Apply patch',
    parameters: Type.Object({ input: Type.String() }),
    type: 'custom',
    format: { type: 'grammar', syntax: 'lark', definition: 'start: "x"' },
  };

  async function* events(): AsyncIterable<ResponseStreamEvent> {
    yield {
      type: 'response.output_item.added',
      output_index: 0,
      item: {
        type: 'custom_tool_call',
        call_id: 'call-custom',
        name: 'apply_patch',
        input: '',
      },
    } as ResponseStreamEvent;
    yield {
      type: 'response.custom_tool_call_input.delta',
      item_id: 'item-custom',
      output_index: 0,
      sequence_number: 1,
      delta: '*** Begin Patch\n',
    } as ResponseStreamEvent;
    yield {
      type: 'response.output_item.done',
      output_index: 0,
      item: {
        type: 'custom_tool_call',
        call_id: 'call-custom',
        name: 'apply_patch',
        input: '*** Begin Patch\n*** End Patch',
      },
    } as ResponseStreamEvent;
    yield {
      type: 'response.completed',
      response: {
        ...getMockOpenaiMessage(model.id, 'stream-custom'),
        output: [
          {
            type: 'custom_tool_call',
            call_id: 'call-custom',
            name: 'apply_patch',
            input: '*** Begin Patch\n*** End Patch',
          },
        ],
      } as Response,
      sequence_number: 2,
    } as ResponseStreamEvent;
  }

  it('maps custom tool calls to executable tool calls', async () => {
    const context: Context = { messages: [], tools: [applyPatchTool] };
    const stream = streamOpenAIResponses({
      model,
      context,
      options: { apiKey: 'test' },
      id: 'msg-custom',
      providerName: 'OpenAI',
      createClient: () => ({
        responses: {
          create: () => events(),
        },
      }),
      buildParams: (): ResponseCreateParamsNonStreaming => ({
        model: model.id,
        input: [],
        stream: false,
      }),
      getMockNativeMessage: getMockOpenaiMessage,
    });

    const result = await stream.drain();

    expect(result.stopReason).toBe('toolUse');
    expect(result.content).toEqual([
      {
        type: 'toolCall',
        toolCallId: 'call-custom',
        name: 'apply_patch',
        arguments: { input: '*** Begin Patch\n*** End Patch' },
      },
    ]);
  });
});
