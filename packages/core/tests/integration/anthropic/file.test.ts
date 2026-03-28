import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { streamAnthropic } from '../../../src/providers/anthropic/index.js';
import { getModel } from '../../../src/models/index.js';
import { describeIfAvailable, getIntegrationEnv } from '../helpers/live.js';

import type { BaseAssistantMessage, Context, Model } from '../../../src/types/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_FIXTURE_PATH = path.resolve(__dirname, '../../utils/research-paper.pdf');

function getResponseText(message: BaseAssistantMessage<'anthropic'>) {
  let text = '';

  for (const block of message.content) {
    if (block.type !== 'response') {
      continue;
    }

    for (const item of block.response) {
      if (item.type === 'text') {
        text += item.content;
      }
    }
  }

  return text.trim();
}

const apiKey = getIntegrationEnv('ANTHROPIC_API_KEY')!;
const describeIfAnthropic = describeIfAvailable(Boolean(apiKey));

describeIfAnthropic('Anthropic File Input Integration', () => {
  let model: Model<'anthropic'>;
  let pdfBase64: string;

  beforeAll(() => {
    if (!fs.existsSync(PDF_FIXTURE_PATH)) {
      throw new Error(`PDF fixture not found: ${PDF_FIXTURE_PATH}`);
    }

    const testModel = getModel('anthropic', 'claude-haiku-4-5');
    if (!testModel) {
      throw new Error('Test model claude-haiku-4-5 not found');
    }

    model = testModel;
    pdfBase64 = fs.readFileSync(PDF_FIXTURE_PATH).toString('base64');
  });

  it('should answer questions grounded in an attached PDF', async () => {
    const context: Context = {
      messages: [
        {
          role: 'user',
          id: 'anthropic-file-1',
          content: [
            {
              type: 'file',
              data: pdfBase64,
              mimeType: 'application/pdf',
              filename: 'research-paper.pdf',
            },
            {
              type: 'text',
              content:
                'Read the attached PDF and reply with exactly: ZIP=<zip>; FRAMEWORK=<framework>.',
            },
          ],
        },
      ],
    };

    const result = await streamAnthropic(
      model,
      context,
      { apiKey, max_tokens: 2000 },
      'anthropic-file-msg-1'
    ).drain();
    const responseText = getResponseText(result);

    expect(result.stopReason).not.toBe('error');
    expect(responseText).toMatch(/94025/);
    expect(responseText).toMatch(/DSA[- ]?QAT/i);
  }, 90000);

  it('should answer questions grounded in a PDF attached to a tool result', async () => {
    const toolCallId = 'anthropic-read-paper-tool-call-1';

    const context: Context = {
      messages: [
        {
          role: 'user',
          id: 'anthropic-tool-result-file-user-1',
          content: [
            {
              type: 'text',
              content:
                'Use the read_research_paper tool to inspect the paper, then answer with exactly: ZIP=<zip>; FRAMEWORK=<framework>.',
            },
          ],
        },
        {
          role: 'assistant',
          id: 'anthropic-tool-result-file-assistant-1',
          api: 'openai',
          model: { id: 'gpt-5.4', api: 'openai' } as any,
          timestamp: Date.now(),
          duration: 100,
          stopReason: 'toolUse',
          content: [
            {
              type: 'toolCall',
              toolCallId,
              name: 'read_research_paper',
              arguments: { fileName: 'research-paper.pdf' },
            },
          ],
          usage: {
            input: 10,
            output: 10,
            cacheRead: 0,
            cacheWrite: 0,
            totalTokens: 20,
            cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          },
          message: {} as any,
        },
        {
          role: 'toolResult',
          id: 'anthropic-tool-result-file-result-1',
          toolCallId,
          toolName: 'read_research_paper',
          content: [
            {
              type: 'file',
              data: pdfBase64,
              mimeType: 'application/pdf',
              filename: 'research-paper.pdf',
            },
          ],
          isError: false,
          timestamp: Date.now(),
        },
      ],
    };

    const result = await streamAnthropic(
      model,
      context,
      { apiKey, max_tokens: 2000 },
      'anthropic-tool-result-file-msg-1'
    ).drain();
    const responseText = getResponseText(result);

    expect(result.stopReason).not.toBe('error');
    expect(responseText).toMatch(/94025/);
    expect(responseText).toMatch(/DSA[- ]?QAT/i);
  }, 90000);
});
