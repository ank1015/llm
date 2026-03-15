import { describe, expect, it } from 'vitest';

import {
  extractAssistantText,
  isExitCommand,
  resolveCliDirectoryContext,
} from '../../src/cli/agent-cli.js';

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
    const message = {
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
      content: [
        {
          type: 'response',
          content: [
            { type: 'text', content: 'First line' },
            { type: 'image', data: 'abc', mimeType: 'image/png' },
            { type: 'text', content: 'Second line' },
          ],
        },
      ],
    } as unknown as BaseAssistantMessage<Api>;

    expect(extractAssistantText(message)).toBe('First line\n\nSecond line');
  });
});
