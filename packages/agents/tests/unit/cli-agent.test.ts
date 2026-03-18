import { describe, expect, it } from 'vitest';

import {
  extractAssistantText,
  isExitCommand,
  resolveCliDirectoryContext,
} from '../../src/cli/agent-cli.js';
import { extractLatestAssistantResponse } from '../../src/cli/shared.js';

import type { Api, BaseAssistantMessage } from '@ank1015/llm-sdk';

describe('agent cli helpers', () => {
  it('resolves project and artifact context from a target directory', () => {
    const context = resolveCliDirectoryContext('/tmp/projects/demo-artifact');

    expect(context).toEqual({
      projectName: 'projects',
      projectDir: '/tmp/projects',
      artifactName: 'demo-artifact',
      artifactDir: '/tmp/projects/demo-artifact',
    });
  });

  it('recognizes exit commands', () => {
    expect(isExitCommand('exit')).toBe(true);
    expect(isExitCommand(' quit ')).toBe(true);
    expect(isExitCommand(':q')).toBe(true);
    expect(isExitCommand('continue')).toBe(false);
  });

  it('extracts assistant text from normalized response blocks', () => {
    const message = createAssistantMessage([
      {
        type: 'response',
        content: [
          { type: 'text', content: 'First line' },
          { type: 'image', data: 'abc', mimeType: 'image/png' },
          { type: 'text', content: 'Second line' },
        ],
      },
    ]);

    expect(extractAssistantText(message)).toBe('First line\n\nSecond line');
  });

  it('returns the latest assistant response from a prompt turn', () => {
    const messages = [
      {
        role: 'user',
        id: 'user-1',
        timestamp: Date.now(),
        content: [{ type: 'text', content: 'Help me inspect the skill.' }],
      },
      createAssistantMessage([
        {
          type: 'response',
          content: [{ type: 'text', content: 'I checked the installed workspace.' }],
        },
      ]),
      {
        role: 'toolResult',
        id: 'tool-result-1',
        toolName: 'read',
        toolCallId: 'tool-1',
        timestamp: Date.now(),
        isError: false,
        content: [{ type: 'text', content: 'ok' }],
      },
      createAssistantMessage([
        {
          type: 'response',
          content: [{ type: 'text', content: 'The helper entrypoint is wired correctly.' }],
        },
      ]),
    ] as Parameters<typeof extractLatestAssistantResponse>[0];

    expect(extractLatestAssistantResponse(messages)).toBe(
      'The helper entrypoint is wired correctly.'
    );
  });
});

function createAssistantMessage(
  content: BaseAssistantMessage<Api>['content']
): BaseAssistantMessage<Api> {
  return {
    role: 'assistant',
    message: {},
    api: 'codex',
    id: 'assistant-1',
    model: { api: 'codex', id: 'gpt-5.4', name: 'GPT-5.4' },
    timestamp: Date.now(),
    duration: 1,
    stopReason: 'stop',
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
    content,
  } as unknown as BaseAssistantMessage<Api>;
}
