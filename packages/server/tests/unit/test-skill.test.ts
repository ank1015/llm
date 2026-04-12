import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { getModel } from '@ank1015/llm-core';
import { toolResultMessage, userMessage } from '@ank1015/llm-sdk';
import { afterEach, describe, expect, it } from 'vitest';

import {
  buildChromeSkillSection,
  buildConversationMarkdown,
  parseTestSkillArgs,
} from '../../src/test-skill.js';

import type { Api } from '@ank1015/llm-core';
import type { AssistantToolCall, Message } from '@ank1015/llm-sdk';

let tempDir: string | null = null;

function splitCuratedModelId(modelId: 'codex/gpt-5.4'): { api: Api; providerModelId: string } {
  const separator = modelId.indexOf('/');
  if (separator <= 0) {
    throw new Error(`Invalid curated modelId: ${modelId}`);
  }

  return {
    api: modelId.slice(0, separator) as Api,
    providerModelId: modelId.slice(separator + 1),
  };
}

function buildAssistantMessage(
  content: Extract<Message, { role: 'assistant' }>['content']
): Extract<Message, { role: 'assistant' }> {
  const modelId = 'codex/gpt-5.4' as const;
  const { api, providerModelId } = splitCuratedModelId(modelId);
  const model = getModel(api, providerModelId as never);

  if (!model) {
    throw new Error(`Model not found for ${modelId}`);
  }

  return {
    role: 'assistant',
    id: 'assistant-message',
    api,
    model,
    message: {} as never,
    timestamp: Date.now(),
    duration: 1,
    stopReason: 'stop',
    content,
    usage: {
      input: 1,
      output: 1,
      cacheRead: 0,
      cacheWrite: 0,
      totalTokens: 2,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: 0,
      },
    },
  };
}

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('test-skill helpers', () => {
  it('parses required and optional CLI flags', () => {
    const parsed = parseTestSkillArgs(
      ['--prompt=Open the page', '--cwd', 'workspace', '--output=transcripts/run.md'],
      '/tmp/base'
    );

    expect(parsed).toEqual({
      prompt: 'Open the page',
      cwd: '/tmp/base/workspace',
      outputPath: '/tmp/base/transcripts/run.md',
    });
  });

  it('builds the chrome skill section with README first and numbered docs next', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'llm-server-test-skill-docs-'));
    await writeFile(join(tempDir, '02-pages.md'), 'Second doc', 'utf8');
    await writeFile(join(tempDir, 'README.md'), 'Read me first', 'utf8');
    await writeFile(join(tempDir, '01-sessions.md'), 'First doc', 'utf8');

    const section = await buildChromeSkillSection(tempDir);

    expect(section).toContain('## Chrome skill');
    expect(section.indexOf('### README')).toBeLessThan(section.indexOf('### 1. 01-sessions.md'));
    expect(section).toContain('### 1. 01-sessions.md\nFirst doc');
    expect(section).toContain('### 2. 02-pages.md\nSecond doc');
  });

  it('renders a markdown transcript with thinking, tool calls, and tool results', () => {
    const toolCall: AssistantToolCall = {
      type: 'toolCall',
      name: 'read',
      arguments: {
        path: '/tmp/example.txt',
      },
      toolCallId: 'tool-call-1',
    };
    const assistantMessage = buildAssistantMessage([
      {
        type: 'thinking',
        thinkingText: 'Need to inspect the file first.',
      },
      toolCall,
      {
        type: 'response',
        response: [{ type: 'text', content: 'I found the issue.' }],
      },
    ]);
    const toolResult = toolResultMessage({
      toolCall,
      content: [{ type: 'text', content: 'File contents here' }],
      details: {
        linesRead: 12,
      },
    });

    const markdown = buildConversationMarkdown({
      systemPrompt: 'system prompt',
      messages: [userMessage('Investigate the file'), assistantMessage, toolResult],
    });

    expect(markdown).toContain('System\nsystem prompt');
    expect(markdown).toContain('User\nInvestigate the file');
    expect(markdown).toContain('Assistant\n\nThinking\nNeed to inspect the file first.');
    expect(markdown).toContain('Tool Call\nName: read');
    expect(markdown).toContain('"path": "/tmp/example.txt"');
    expect(markdown).toContain('Tool Result\n\nTool: read\n\nStatus: ok');
    expect(markdown).toContain('File contents here');
    expect(markdown).toContain('"linesRead": 12');
  });
});
