import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  buildCliSessionMarkdown,
  formatConversationAsMarkdown,
  saveCliSessionMarkdown,
} from '../../src/cli/session-markdown.js';

import type {
  Api,
  BaseAssistantMessage,
  Message,
  ToolResultMessage,
  UserMessage,
} from '@ank1015/llm-sdk';

const cleanupPaths: string[] = [];

afterEach(async () => {
  await Promise.all(
    cleanupPaths.splice(0).map((path) => rm(path, { recursive: true, force: true }))
  );
});

describe('session markdown export', () => {
  it('formats a conversation transcript as markdown', () => {
    const messages = createSampleMessages();

    const markdown = formatConversationAsMarkdown(messages);

    expect(markdown).toContain('### Task (User Request)');
    expect(markdown).toContain('Generate a screenshot summary');
    expect(markdown).toContain('### Assistant Response #1');
    expect(markdown).toContain('**Tool Call: bash**');
    expect(markdown).toContain('### Tool Result: bash [SUCCESS]');
    expect(markdown).toContain('<thinking>');
  });

  it('builds a full session markdown document with metadata', () => {
    const markdown = buildCliSessionMarkdown({
      sessionId: 'session-123',
      sessionName: 'Web Skill Tester Session',
      projectName: 'agents',
      workingDir: '/tmp/workspace',
      messages: createSampleMessages(),
      savedAt: new Date('2026-03-18T12:34:56.000Z'),
    });

    expect(markdown).toContain('# Web Skill Tester Session');
    expect(markdown).toContain('Session ID: session-123');
    expect(markdown).toContain('Project: agents');
    expect(markdown).toContain('Working Directory: /tmp/workspace');
    expect(markdown).toContain('Saved At: 2026-03-18T12:34:56.000Z');
  });

  it('writes session markdown files into the requested archive subdirectory', async () => {
    const rootDir = await mkdtemp(join(tmpdir(), 'llm-agents-session-archive-'));
    cleanupPaths.push(rootDir);

    const savedPath = await saveCliSessionMarkdown({
      sessionId: 'session-123',
      sessionName: 'Web Skill Tester Session',
      projectName: 'agents',
      workingDir: '/tmp/workspace',
      archiveSubdir: 'skill-tester',
      rootDir,
      messages: createSampleMessages(),
      savedAt: new Date('2026-03-18T12:34:56.000Z'),
    });

    expect(savedPath).toBeTruthy();
    await expect(readdir(join(rootDir, 'skill-tester'))).resolves.toHaveLength(1);
    const fileContents = await readFile(savedPath as string, 'utf-8');
    expect(fileContents).toContain('Web Skill Tester Session');
    expect(fileContents).toContain('Tool Result: bash [SUCCESS]');
  });
});

function createSampleMessages(): Message[] {
  const userMessage: UserMessage = {
    role: 'user',
    id: 'user-1',
    timestamp: Date.now(),
    content: [{ type: 'text', content: 'Generate a screenshot summary' }],
  };

  const assistantMessage = {
    role: 'assistant',
    id: 'assistant-1',
    message: {},
    api: 'codex',
    model: { api: 'codex', id: 'gpt-5.4', name: 'GPT-5.4' },
    timestamp: Date.now(),
    duration: 1,
    stopReason: 'toolUse',
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
    content: [
      { type: 'thinking', thinkingText: 'Need to inspect the workspace first.' },
      {
        type: 'toolCall',
        name: 'bash',
        toolCallId: 'tool-1',
        arguments: { command: 'ls -la' },
      },
      {
        type: 'response',
        content: [{ type: 'text', content: 'I am checking the workspace now.' }],
      },
    ],
  } as unknown as BaseAssistantMessage<Api>;

  const toolResultMessage: ToolResultMessage = {
    role: 'toolResult',
    id: 'tool-result-1',
    toolName: 'bash',
    toolCallId: 'tool-1',
    content: [{ type: 'text', content: 'total 8\n-rw-r--r--  file.txt' }],
    isError: false,
    timestamp: Date.now(),
  };

  return [userMessage, assistantMessage, toolResultMessage];
}
