import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { beforeAll, describe, expect, it } from 'vitest';

import { complete } from '../../../src/llm/complete.js';
import { getModel } from '../../../src/models/index.js';

import type {
  BaseAssistantMessage,
  CodexProviderOptions,
  Context,
  Model,
} from '@ank1015/llm-types';

const CODEX_HOME = path.join(process.env.HOME || '', '.codex');
const CODEX_AUTH_PATH = path.join(CODEX_HOME, 'auth.json');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PDF_FIXTURE_PATH = path.resolve(__dirname, '../../utils/research-paper.pdf');

const auth = fs.existsSync(CODEX_AUTH_PATH)
  ? JSON.parse(fs.readFileSync(CODEX_AUTH_PATH, 'utf-8'))
  : null;

const accessToken = auth?.tokens?.access_token as string | undefined;
const accountId = auth?.tokens?.account_id as string | undefined;

function getResponseText(message: BaseAssistantMessage<'codex'>) {
  let text = '';

  for (const block of message.content) {
    if (block.type !== 'response') {
      continue;
    }

    for (const item of block.content) {
      if (item.type === 'text') {
        text += item.content;
      }
    }
  }

  return text.trim();
}

describe('Codex File Input Integration', () => {
  let model: Model<'codex'>;
  let pdfBase64: string;

  function getOptions(
    extra?: Omit<Partial<CodexProviderOptions>, 'apiKey' | 'chatgpt-account-id'>
  ): CodexProviderOptions {
    return {
      apiKey: accessToken!,
      'chatgpt-account-id': accountId!,
      instructions: 'You are a careful document reader. Follow the requested output format.',
      ...extra,
    };
  }

  beforeAll(() => {
    if (!accessToken || !accountId) {
      throw new Error(
        'CODEX_API_KEY and CODEX_CHATGPT_ACCOUNT_ID environment variables are required for integration tests'
      );
    }

    if (!fs.existsSync(PDF_FIXTURE_PATH)) {
      throw new Error(`PDF fixture not found: ${PDF_FIXTURE_PATH}`);
    }

    const testModel = getModel('codex', 'gpt-5.3-codex');
    if (!testModel) {
      throw new Error('Test model gpt-5.3-codex not found');
    }

    model = testModel;
    pdfBase64 = fs.readFileSync(PDF_FIXTURE_PATH).toString('base64');
  });

  it('should answer questions grounded in an attached PDF', async () => {
    const context: Context = {
      messages: [
        {
          role: 'user',
          id: 'codex-file-1',
          content: [
            {
              type: 'text',
              content:
                'Read the attached PDF and reply with exactly: ZIP=<zip>; FRAMEWORK=<framework>. If you cannot read the PDF, reply exactly FILE_NOT_READABLE.',
            },
            {
              type: 'file',
              data: pdfBase64,
              mimeType: 'application/pdf',
              filename: 'research-paper.pdf',
            },
          ],
        },
      ],
    };

    const result = await complete(model, context, getOptions(), 'codex-file-msg-1');
    const responseText = getResponseText(result);

    expect(result.stopReason).not.toBe('error');
    expect(responseText).toBeTruthy();
    expect(responseText).not.toContain('FILE_NOT_READABLE');
    expect(responseText).toMatch(/94025/);
    expect(responseText).toMatch(/DSA[- ]?QAT/i);
  }, 90000);

  it('should answer questions grounded in a PDF attached to a tool result', async () => {
    const toolCallId = 'codex-read-paper-tool-call-1';

    const context: Context = {
      messages: [
        {
          role: 'user',
          id: 'codex-tool-result-file-user-1',
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
          id: 'codex-tool-result-file-assistant-1',
          api: 'google',
          model: { id: 'gemini-2.5-flash', api: 'google' } as any,
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
          id: 'codex-tool-result-file-result-1',
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

    const result = await complete(model, context, getOptions(), 'codex-tool-result-file-msg-1');
    const responseText = getResponseText(result);

    expect(result.stopReason).not.toBe('error');
    expect(responseText).toMatch(/94025/);
    expect(responseText).toMatch(/DSA[- ]?QAT/i);
  }, 90000);
});
