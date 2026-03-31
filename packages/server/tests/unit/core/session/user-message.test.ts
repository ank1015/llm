import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  USER_ARTIFACTS_DIR,
  buildPromptUserMessage,
  cloneUserMessage,
  getVisibleUserMessageText,
  rewriteUserMessageVisibleText,
} from '../../../../src/core/session/user-message.js';

import type { Attachment, UserMessage } from '@ank1015/llm-core';

let tempDir: string | null = null;

afterEach(async () => {
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
    tempDir = null;
  }
});

describe('session user message helpers', () => {
  it('persists prompt attachments and builds hidden saved-path notes', async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'llm-user-message-'));
    const attachments: Attachment[] = [
      {
        id: 'pdf-1',
        type: 'file',
        fileName: 'research-paper.pdf',
        mimeType: 'application/pdf',
        size: 8,
        content: Buffer.from('%PDF-test').toString('base64'),
      },
      {
        id: 'image-1',
        type: 'image',
        fileName: 'diagram.png',
        mimeType: 'image/png',
        size: 7,
        content: Buffer.from('pngdata').toString('base64'),
      },
    ];

    const message = await buildPromptUserMessage({
      artifactDir: tempDir,
      message: 'Please inspect these files',
      attachments,
    });

    expect(message.content[0]).toEqual({
      type: 'text',
      content: 'Please inspect these files',
    });
    expect(message.content).toHaveLength(5);

    const hiddenBlocks = message.content.filter(
      (block): block is Extract<UserMessage['content'][number], { type: 'text' }> => {
        return block.type === 'text' && block.metadata?.hiddenFromUI === true;
      }
    );
    expect(hiddenBlocks).toHaveLength(2);
    expect(hiddenBlocks[0]?.metadata?.kind).toBe('saved-attachment-path');
    expect(hiddenBlocks[0]?.content).toContain('research-paper.pdf');
    expect(hiddenBlocks[1]?.content).toContain('diagram.png');

    const fileBlock = message.content.find(
      (block): block is Extract<UserMessage['content'][number], { type: 'file' }> => {
        return block.type === 'file';
      }
    );
    const imageBlock = message.content.find(
      (block): block is Extract<UserMessage['content'][number], { type: 'image' }> => {
        return block.type === 'image';
      }
    );

    expect(fileBlock?.metadata?.artifactRelativePath).toBe(
      `${USER_ARTIFACTS_DIR}/research-paper.pdf`
    );
    expect(imageBlock?.metadata?.artifactRelativePath).toBe(`${USER_ARTIFACTS_DIR}/diagram.png`);

    const savedPdf = await readFile(
      join(tempDir, USER_ARTIFACTS_DIR, 'research-paper.pdf'),
      'utf-8'
    );
    const savedImage = await readFile(join(tempDir, USER_ARTIFACTS_DIR, 'diagram.png'), 'utf-8');
    expect(savedPdf).toBe('%PDF-test');
    expect(savedImage).toBe('pngdata');
  });

  it('rewrites only visible user text while preserving hidden blocks and attachments', () => {
    const original: UserMessage = {
      role: 'user',
      id: 'user-1',
      timestamp: 1,
      content: [
        { type: 'text', content: 'Original text' },
        {
          type: 'text',
          content:
            'Attachment "report.pdf" was saved to "/tmp/report.pdf" and can be referenced later if needed.',
          metadata: {
            hiddenFromUI: true,
            kind: 'saved-attachment-path',
          },
        },
        {
          type: 'file',
          data: 'ZmFrZQ==',
          mimeType: 'application/pdf',
          filename: 'report.pdf',
          metadata: {
            artifactRelativePath: '.max/user-artifacts/report.pdf',
          },
        },
      ],
    };

    const rewritten = rewriteUserMessageVisibleText(original, '');
    expect(rewritten.content).toHaveLength(2);
    expect(rewritten.content[0]).toMatchObject({
      type: 'text',
      metadata: {
        hiddenFromUI: true,
      },
    });
    expect(rewritten.content[1]).toMatchObject({
      type: 'file',
      filename: 'report.pdf',
    });
    expect(getVisibleUserMessageText(rewritten)).toBe('');

    const cloned = cloneUserMessage(original);
    expect(cloned.id).not.toBe(original.id);
    expect(cloned.content).toEqual(original.content);
  });
});
