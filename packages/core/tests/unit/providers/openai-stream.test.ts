import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { Context, Model } from '@ank1015/llm-types';
import type { Response } from 'openai/resources/responses/responses.js';

const openAIMocks = vi.hoisted(() => ({
  buildParams: vi.fn(),
  createClient: vi.fn(),
  getMockOpenaiMessage: vi.fn(),
  mapStopReason: vi.fn(),
  responsesCreate: vi.fn(),
}));

vi.mock('../../../src/providers/openai/utils.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../../src/providers/openai/utils.js')>();

  return {
    ...actual,
    buildParams: openAIMocks.buildParams,
    createClient: openAIMocks.createClient,
    getMockOpenaiMessage: openAIMocks.getMockOpenaiMessage,
    mapStopReason: openAIMocks.mapStopReason,
  };
});

async function* responseEvents(events: unknown[]) {
  for (const event of events) {
    yield event;
  }
}

describe('OpenAI Stream', () => {
  let streamOpenAI: typeof import('../../../src/providers/openai/stream.js').streamOpenAI;

  const mockModel: Model<'openai'> = {
    id: 'gpt-5',
    name: 'GPT-5',
    api: 'openai',
    baseUrl: 'https://api.openai.com/v1',
    reasoning: false,
    input: ['text', 'image'],
    cost: { input: 1, output: 2, cacheRead: 0.1, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 4096,
    tools: ['function_calling'],
  };

  const mockResponse: Response = {
    id: 'resp_test',
    object: 'response',
    created_at: 1,
    output_text: '',
    status: 'completed',
    incomplete_details: null,
    parallel_tool_calls: false,
    error: null,
    instructions: null,
    max_output_tokens: null,
    model: mockModel.id,
    output: [],
    previous_response_id: null,
    temperature: 1,
    text: {},
    tool_choice: 'auto',
    tools: [],
    top_p: 1,
    truncation: 'disabled',
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      output_tokens_details: {
        reasoning_tokens: 0,
      },
      input_tokens_details: {
        cached_tokens: 0,
      },
      total_tokens: 0,
    },
    metadata: {},
  };

  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    openAIMocks.buildParams.mockReturnValue({ model: mockModel.id, input: [] });
    openAIMocks.createClient.mockReturnValue({
      responses: {
        create: openAIMocks.responsesCreate,
      },
    });
    openAIMocks.getMockOpenaiMessage.mockReturnValue({ ...mockResponse });
    openAIMocks.mapStopReason.mockReturnValue('stop');
  });

  beforeEach(async () => {
    streamOpenAI = (await import('../../../src/providers/openai/stream.js')).streamOpenAI;
  });

  it('streams partial image previews and persists the final generated image', async () => {
    openAIMocks.responsesCreate.mockResolvedValue(
      responseEvents([
        {
          type: 'response.output_item.added',
          item: {
            type: 'image_generation_call',
            id: 'img_1',
            result: null,
            status: 'in_progress',
          },
        },
        {
          type: 'response.image_generation_call.in_progress',
          item_id: 'img_1',
          output_index: 0,
          sequence_number: 1,
        },
        {
          type: 'response.image_generation_call.partial_image',
          item_id: 'img_1',
          output_index: 0,
          partial_image_b64: 'partial-b64',
          partial_image_index: 0,
          sequence_number: 2,
        },
        {
          type: 'response.output_item.done',
          item: {
            type: 'image_generation_call',
            id: 'img_1',
            result: 'final-b64',
            status: 'completed',
            revised_prompt: 'A bright orange cat portrait',
            output_format: 'jpeg',
            quality: 'high',
            background: 'transparent',
            size: '1024x1024',
            action: 'generate',
          },
        },
        {
          type: 'response.completed',
          response: {
            ...mockResponse,
            output: [
              {
                type: 'image_generation_call',
                id: 'img_1',
                result: 'final-b64',
                status: 'completed',
              },
            ],
            usage: {
              input_tokens: 100,
              output_tokens: 200,
              output_tokens_details: {
                reasoning_tokens: 0,
              },
              input_tokens_details: {
                cached_tokens: 10,
              },
              total_tokens: 310,
            },
          },
        },
      ])
    );

    const context: Context = { messages: [] };
    const stream = streamOpenAI(
      mockModel,
      context,
      {
        apiKey: 'test-key',
        tools: [
          {
            type: 'image_generation',
            partial_images: 1,
            output_format: 'jpeg',
            quality: 'high',
            background: 'transparent',
            size: '1024x1024',
            action: 'generate',
          },
        ],
      },
      'openai-img-1'
    );

    const events: Array<{ type: string }> = [];
    for await (const event of stream) {
      events.push(event);
    }

    const result = await stream.result();

    expect(events.map((event) => event.type)).toEqual([
      'start',
      'image_start',
      'image_frame',
      'image_frame',
      'image_end',
      'done',
    ]);
    expect(result.content).toEqual([
      {
        type: 'response',
        content: [
          {
            type: 'image',
            data: 'final-b64',
            mimeType: 'image/jpeg',
            metadata: {
              generationStage: 'final',
              generationProvider: 'openai',
              generationProviderItemId: 'img_1',
              generationAction: 'generate',
              generationRevisedPrompt: 'A bright orange cat portrait',
              generationOutputSize: '1024x1024',
              generationOutputQuality: 'high',
              generationOutputBackground: 'transparent',
              generationOutputFormat: 'jpeg',
            },
          },
        ],
      },
    ]);
    expect(result.usage).toMatchObject({
      input: 90,
      output: 200,
      cacheRead: 10,
      totalTokens: 310,
    });
  });
});
