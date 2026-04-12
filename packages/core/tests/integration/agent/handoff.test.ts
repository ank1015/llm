import fs from 'node:fs';
import path from 'node:path';
import { runInNewContext } from 'node:vm';

import { Type } from '@sinclair/typebox';
import { beforeAll, expect, it } from 'vitest';

import {
  buildToolResultMessage,
  buildUserMessage,
  complete,
  getModel,
} from '../../../src/index.js';
import { describeIfAvailable, getAssistantText, getIntegrationEnv } from '../helpers/live.js';

import type {
  Api,
  AgentTool,
  AgentToolResult,
  AssistantToolCall,
  BaseAssistantMessage,
  Message,
  Model,
} from '../../../src/types/index.js';

const zaiApiKey = getIntegrationEnv('ZAI_API_KEY')!;
const geminiApiKey = getIntegrationEnv('GEMINI_API_KEY')!;
const anthropicApiKey = getIntegrationEnv('ANTHROPIC_API_KEY')!;
const openAIApiKey = getIntegrationEnv('OPENAI_API_KEY')!;

const CODEX_HOME = path.join(process.env.HOME || '', '.codex');
const CODEX_AUTH_PATH = path.join(CODEX_HOME, 'auth.json');
const codexAuth = fs.existsSync(CODEX_AUTH_PATH)
  ? JSON.parse(fs.readFileSync(CODEX_AUTH_PATH, 'utf-8'))
  : null;
const codexAccessToken = codexAuth?.tokens?.access_token as string | undefined;
const codexAccountId = codexAuth?.tokens?.account_id as string | undefined;

const describeIfAllProviders = describeIfAvailable(
  Boolean(
    zaiApiKey &&
      geminiApiKey &&
      anthropicApiKey &&
      openAIApiKey &&
      codexAccessToken &&
      codexAccountId
  )
);

const EXPRESSION = '123456789123456789n * 987654321987654321n';
const EXPECTED_RESULT = (123456789123456789n * 987654321987654321n).toString();

const SYSTEM_PROMPT = [
  'You are participating in a multi-provider handoff integration test.',
  'If there is no calculator result in the conversation yet, and the user asks for a multiplication, call the calculator tool exactly once with the requested JavaScript expression.',
  'If there is already a calculator tool result anywhere in the conversation, do not call the calculator tool again.',
  `After a calculator tool result exists, reply with exactly RESULT=${EXPECTED_RESULT} and nothing else.`,
].join(' ');

const INITIAL_PROMPT = [
  'Use the calculator tool exactly once.',
  `Pass this exact JavaScript expression verbatim: ${EXPRESSION}`,
  'Do not solve the multiplication yourself and do not provide a final answer yet.',
].join(' ');

const HANDOFF_PROMPT =
  [
    'A new assistant is taking over.',
    'Read the full conversation carefully.',
    'There is already a calculator tool result in the history.',
    'Do not call the calculator again.',
    'Do not recompute, round, shorten, summarize, or estimate the number.',
    'Copy the exact digits from the calculator tool result and reply with exactly RESULT=<that exact copied value>.',
  ].join(' ');

const CALCULATOR_TOOL_SCHEMA = Type.Object({
  expression: Type.String({
    description: 'A JavaScript expression to execute and return as a string.',
  }),
});

describeIfAllProviders('Agent Provider Handoff Integration', () => {
  let zaiModel: Model<'zai'>;
  let googleModel: Model<'google'>;
  let anthropicModel: Model<'anthropic'>;
  let openAIModel: Model<'openai'>;
  let codexModel: Model<'codex'>;

  beforeAll(() => {
    zaiModel = requireModel('zai', 'glm-5');
    googleModel = requireModel('google', 'gemini-3-flash-preview');
    anthropicModel = requireModel('anthropic', 'claude-haiku-4-5');
    openAIModel = requireModel('openai', 'gpt-5.4');
    codexModel = requireModel('codex', 'gpt-5.3-codex');
  });

  it('hands off a tool-backed conversation across zai, google, anthropic, openai, and codex', async () => {
    const observedExpressions: string[] = [];
    const calculatorTool = createCalculatorTool(observedExpressions);
    const messages: Message[] = [buildUserMessage(INITIAL_PROMPT)];

    logStage('starting zai turn', messages);
    const zaiAssistant = await complete(
      zaiModel,
      {
        systemPrompt: SYSTEM_PROMPT,
        messages,
        tools: [calculatorTool],
      },
      {
        apiKey: zaiApiKey!,
        thinking: {
          type: 'enabled',
          clear_thinking: false,
        },
      },
      'agent-handoff-zai-1'
    );

    expect(zaiAssistant.role).toBe('assistant');
    expect(zaiAssistant.api).toBe('zai');
    expect(zaiAssistant.stopReason).toBe('toolUse');

    logAssistantStage('zai response', zaiAssistant);
    const zaiToolCall = getSingleToolCall(zaiAssistant);
    expect(zaiToolCall.name).toBe('calculator');
    logToolCall('zai tool call', zaiToolCall);

    messages.push(zaiAssistant);

    logStage('executing calculator tool', messages);
    const toolExecution = await calculatorTool.execute({
      toolCallId: zaiToolCall.toolCallId,
      params: {
        expression: getExpressionArgument(zaiToolCall),
      },
      context: { messages },
    });

    const toolResult = buildToolResultMessage(zaiToolCall, toolExecution, false);

    expect(normalizeExpression(observedExpressions[0]!)).toBe(normalizeExpression(EXPRESSION));
    expect(getMessageText(toolResult)).toBe(EXPECTED_RESULT);

    messages.push(toolResult);
    logStage(`tool result appended: ${getMessageText(toolResult)}`, messages);
    messages.push(buildUserMessage(HANDOFF_PROMPT));

    logStage('starting google handoff', messages);
    const googleAssistant = await complete(
      googleModel,
      {
        systemPrompt: SYSTEM_PROMPT,
        messages,
        tools: [calculatorTool],
      },
      {
        apiKey: geminiApiKey!,
        maxOutputTokens: 512,
        thinkingConfig: {
          thinkingLevel: 'minimal',
        },
      },
      'agent-handoff-google-1'
    );

    logAssistantStage('google response', googleAssistant);
    assertExactResultReply(googleAssistant, 'google');
    expect(hasToolCall(googleAssistant)).toBe(false);
    messages.push(googleAssistant);

    messages.push(buildUserMessage(HANDOFF_PROMPT));

    logStage('starting anthropic handoff', messages);
    const anthropicAssistant = await complete(
      anthropicModel,
      {
        systemPrompt: SYSTEM_PROMPT,
        messages,
        tools: [calculatorTool],
      },
      {
        apiKey: anthropicApiKey!,
        max_tokens: 256,
      },
      'agent-handoff-anthropic-1'
    );

    logAssistantStage('anthropic response', anthropicAssistant);
    assertExactResultReply(anthropicAssistant, 'anthropic');
    expect(hasToolCall(anthropicAssistant)).toBe(false);
    messages.push(anthropicAssistant);

    messages.push(buildUserMessage(HANDOFF_PROMPT));

    logStage('starting openai handoff', messages);
    const openAIAssistant = await complete(
      openAIModel,
      {
        systemPrompt: SYSTEM_PROMPT,
        messages,
        tools: [calculatorTool],
      },
      {
        apiKey: openAIApiKey!,
        max_output_tokens: 256,
        reasoning: {
          effort: 'none',
        },
      },
      'agent-handoff-openai-1'
    );

    logAssistantStage('openai response', openAIAssistant);
    assertExactResultReply(openAIAssistant, 'openai');
    expect(hasToolCall(openAIAssistant)).toBe(false);
    messages.push(openAIAssistant);

    messages.push(buildUserMessage(HANDOFF_PROMPT));

    logStage('starting codex handoff', messages);
    const codexAssistant = await complete(
      codexModel,
      {
        systemPrompt: SYSTEM_PROMPT,
        messages,
        tools: [calculatorTool],
      },
      {
        apiKey: codexAccessToken!,
        'chatgpt-account-id': codexAccountId!,
      },
      'agent-handoff-codex-1'
    );

    logAssistantStage('codex response', codexAssistant);
    assertExactResultReply(codexAssistant, 'codex');
    expect(hasToolCall(codexAssistant)).toBe(false);
    messages.push(codexAssistant);

    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'toolResult',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
      'assistant',
    ]);
  }, 240000);
});

function requireModel<TApi extends Api>(api: TApi, id: string): Model<TApi> {
  const model = getModel(api, id);
  if (!model) {
    throw new Error(`Test model ${id} not found`);
  }
  return model;
}

function createCalculatorTool(
  observedExpressions: string[]
): AgentTool<typeof CALCULATOR_TOOL_SCHEMA, { expression: string; result: string }> {
  return {
    name: 'calculator',
    description:
      'Execute a JavaScript arithmetic expression exactly as provided and return the result as plain text.',
    parameters: CALCULATOR_TOOL_SCHEMA,
    async execute({ params }): Promise<AgentToolResult<{ expression: string; result: string }>> {
      observedExpressions.push(params.expression);
      console.log(`[handoff] calculator executing expression: ${params.expression}`);

      const value = runInNewContext(params.expression, {}, { timeout: 1000 });
      const result =
        typeof value === 'bigint'
          ? value.toString()
          : typeof value === 'number'
            ? String(value)
            : typeof value === 'string'
              ? value
              : (JSON.stringify(value) ?? String(value));

      console.log(`[handoff] calculator result: ${result}`);

      return {
        content: [{ type: 'text', content: result }],
        details: {
          expression: params.expression,
          result,
        },
      };
    },
  };
}

function getSingleToolCall<TApi extends Api>(message: BaseAssistantMessage<TApi>): AssistantToolCall {
  const toolCalls = message.content.filter(
    (content): content is AssistantToolCall => content.type === 'toolCall'
  );

  expect(toolCalls).toHaveLength(1);
  return toolCalls[0]!;
}

function getExpressionArgument(toolCall: AssistantToolCall): string {
  expect(typeof toolCall.arguments.expression).toBe('string');
  return toolCall.arguments.expression as string;
}

function hasToolCall<TApi extends Api>(message: BaseAssistantMessage<TApi>): boolean {
  return message.content.some((content) => content.type === 'toolCall');
}

function assertExactResultReply<TApi extends Api>(
  message: BaseAssistantMessage<TApi>,
  provider: TApi
): void {
  const text = getAssistantText(message);
  expect(message.role).toBe('assistant');
  expect(message.api).toBe(provider);
  expect(message.stopReason).not.toBe('error');
  if (text !== `RESULT=${EXPECTED_RESULT}`) {
    throw new Error(
      [
        `[handoff] ${provider} returned an unexpected final reply.`,
        `Expected: RESULT=${EXPECTED_RESULT}`,
        `Received: ${text}`,
      ].join('\n')
    );
  }
}

function getMessageText(message: Message): string {
  if (message.role === 'assistant') {
    return getAssistantText(message);
  }

  if (message.role === 'toolResult') {
    let text = '';
    for (const item of message.content) {
      if (item.type === 'text') {
        text += item.content;
      }
    }
    return text.trim();
  }

  if (message.role === 'user') {
    let text = '';
    for (const item of message.content) {
      if (item.type === 'text') {
        text += item.content;
      }
    }
    return text.trim();
  }

  return '';
}

function normalizeExpression(expression: string): string {
  return expression.replace(/\s+/g, '').replace(/;+$/g, '');
}

function logStage(label: string, messages: Message[]) {
  console.log(`[handoff] ${label}`);
  console.log(`[handoff] roles=${messages.map((message) => message.role).join(' -> ')}`);
}

function logAssistantStage<TApi extends Api>(label: string, message: BaseAssistantMessage<TApi>) {
  console.log(
    `[handoff] ${label} | api=${message.api} stopReason=${message.stopReason} toolCalls=${message.content.filter((content) => content.type === 'toolCall').length}`
  );
  console.log(`[handoff] ${label} text=${JSON.stringify(getAssistantText(message))}`);
}

function logToolCall(label: string, toolCall: AssistantToolCall) {
  console.log(
    `[handoff] ${label} | name=${toolCall.name} toolCallId=${toolCall.toolCallId} args=${JSON.stringify(toolCall.arguments)}`
  );
}
