import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { Type } from '@sinclair/typebox';
import { afterAll, beforeAll, expect, it } from 'vitest';

import {
  collectStreamEvents,
  describeIfAvailable,
  getIntegrationEnv,
} from '../../../core/tests/integration/helpers/live.js';
import { resetSdkConfig, setSdkConfig } from '../../src/config.js';
import { agent, getText, tool, userMessage } from '../../src/index.js';
import { setProviderCredentials } from '../../src/keys.js';
import { loadSessionMessages } from '../../src/session.js';

import type { AgentEvent, Message } from '../../src/index.js';

const openAiApiKey = getIntegrationEnv('OPENAI_API_KEY');
const describeIfOpenAI = describeIfAvailable(Boolean(openAiApiKey));

describeIfOpenAI('SDK agent() OpenAI integration', () => {
  let tempDirectory = '';
  let keysFilePath = '';
  let sessionsBaseDir = '';

  beforeAll(async () => {
    tempDirectory = await mkdtemp(join(tmpdir(), 'llm-sdk-agent-openai-'));
    keysFilePath = join(tempDirectory, 'keys.env');
    sessionsBaseDir = join(tempDirectory, 'sessions');

    await setProviderCredentials(keysFilePath, 'openai', {
      apiKey: openAiApiKey!,
    });

    setSdkConfig({ sessionsBaseDir });
  });

  afterAll(async () => {
    resetSdkConfig();

    if (tempDirectory) {
      await rm(tempDirectory, { recursive: true, force: true });
    }
  });

  it('awaits a successful agent run and auto-creates the session path', async () => {
    const run = agent({
      modelId: 'openai/gpt-5.4-mini',
      keysFilePath,
      reasoningEffort: 'low',
      inputMessages: [buildUserTextMessage('Reply with exactly SDK_AGENT_AWAIT_OK')],
      overrideProviderSetting: {
        max_output_tokens: 64,
      },
    });

    expect(run.sessionPath.startsWith(sessionsBaseDir)).toBe(true);
    expect(run.sessionPath.endsWith('.jsonl')).toBe(true);

    const result = await run;

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.sessionPath.startsWith(sessionsBaseDir)).toBe(true);
    expect(result.sessionPath.endsWith('.jsonl')).toBe(true);
    expect(result.messages[0]).toEqual(
      buildUserTextMessage('Reply with exactly SDK_AGENT_AWAIT_OK')
    );
    expect(result.newMessages.length).toBeGreaterThan(0);
    expect(result.finalAssistantMessage).toBeDefined();
    expect(result.totalTokens).toBeGreaterThan(0);
    expect(getText(result.finalAssistantMessage)).toContain('SDK_AGENT_AWAIT_OK');

    const loaded = await loadSessionMessages({ path: result.sessionPath });
    expect(loaded?.messages[0]).toEqual(
      buildUserTextMessage('Reply with exactly SDK_AGENT_AWAIT_OK')
    );
    expect(loaded?.messages.at(-1)?.role).toBe('assistant');
  }, 60000);

  it('streams raw agent events and can still be awaited for the final result', async () => {
    const run = agent({
      modelId: 'openai/gpt-5.4-mini',
      keysFilePath,
      reasoningEffort: 'low',
      inputMessages: [buildUserTextMessage('Reply with exactly SDK_AGENT_STREAM_OK')],
      overrideProviderSetting: {
        max_output_tokens: 64,
      },
    });

    const events = await collectStreamEvents(run);
    const result = await run;

    expect(events.length).toBeGreaterThan(0);
    expect(events.some((event: AgentEvent) => event.type === 'agent_start')).toBe(true);
    expect(events.some((event: AgentEvent) => event.type === 'turn_start')).toBe(true);
    expect(events.some((event: AgentEvent) => event.type === 'message_start')).toBe(true);
    expect(events.some((event: AgentEvent) => event.type === 'message_end')).toBe(true);
    expect(events.some((event: AgentEvent) => event.type === 'agent_end')).toBe(true);
    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(result.messages[0]).toEqual(
      buildUserTextMessage('Reply with exactly SDK_AGENT_STREAM_OK')
    );
    expect(getText(result.finalAssistantMessage)).toContain('SDK_AGENT_STREAM_OK');
  }, 60000);

  it('executes a tool call, emits tool events, and persists the tool result in the session', async () => {
    const lookupMagicValue = tool({
      name: 'lookup_magic_value',
      description: 'Returns the integration magic value.',
      parameters: Type.Object({}),
      execute: async () => ({
        content: [{ type: 'text', content: 'SDK_AGENT_TOOL_OK_2718' }],
        details: { source: 'integration-test' },
      }),
    });

    const run = agent({
      modelId: 'openai/gpt-5.4-mini',
      keysFilePath,
      reasoningEffort: 'low',
      system:
        'Call the lookup_magic_value tool exactly once. After you receive the tool result, do not call any more tools. Respond with exactly the returned tool text and nothing else.',
      inputMessages: [buildUserTextMessage('What is the integration magic value?')],
      tools: [lookupMagicValue],
      maxTurns: 6,
      overrideProviderSetting: {
        max_output_tokens: 128,
      },
    });

    const events = await collectStreamEvents(run);
    const result = await run;

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error(result.error.message);
    }

    expect(events.some((event: AgentEvent) => event.type === 'tool_execution_start')).toBe(true);
    expect(events.some((event: AgentEvent) => event.type === 'tool_execution_end')).toBe(true);
    expect(result.messages[0]).toEqual(
      buildUserTextMessage('What is the integration magic value?')
    );
    expect(result.newMessages.some((message: Message) => message.role === 'toolResult')).toBe(true);
    expect(getText(result.finalAssistantMessage)).toContain('SDK_AGENT_TOOL_OK_2718');

    const loaded = await loadSessionMessages({ path: result.sessionPath });
    expect(loaded?.messages.some((message: Message) => message.role === 'toolResult')).toBe(true);
    expect(loaded?.messages.at(-1)?.role).toBe('assistant');
  }, 90000);
});

function buildUserTextMessage(text: string): Message {
  return userMessage(text, {
    id: `user-${text.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
  });
}
