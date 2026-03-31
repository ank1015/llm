import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';

import { ensureDir, pathExists } from '../storage/fs.js';

import type {
  Attachment,
  Content,
  FileContent,
  ImageContent,
  TextContent,
  UserMessage,
} from '@ank1015/llm-core';

export const USER_ARTIFACTS_DIR = '.max/user-artifacts';

type PersistedUserAttachment = {
  attachment: Attachment;
  artifactRelativePath: string;
  artifactAbsolutePath: string;
};

const MIME_EXTENSION_MAP: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/gif': '.gif',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/png': '.png',
  'image/svg+xml': '.svg',
  'image/webp': '.webp',
};

function cloneContentBlock(block: Content[number]): Content[number] {
  if (block.type === 'text') {
    return {
      ...block,
      ...(block.metadata ? { metadata: { ...block.metadata } } : {}),
    };
  }

  if (block.type === 'image') {
    return {
      ...block,
      ...(block.metadata ? { metadata: { ...block.metadata } } : {}),
    };
  }

  return {
    ...block,
    ...(block.metadata ? { metadata: { ...block.metadata } } : {}),
  };
}

function isHiddenTextBlock(block: Content[number]): block is TextContent {
  return block.type === 'text' && block.metadata?.hiddenFromUI === true;
}

function sanitizeAttachmentFileName(
  fileName: string,
  mimeType: string,
  type: Attachment['type']
): string {
  const normalized = fileName.replace(/\\/g, '/').trim();
  const baseName = basename(normalized) || `attachment${type === 'file' ? '.pdf' : ''}`;
  const cleaned = baseName.replace(/[^\w.-]+/g, '-').replace(/^-+|-+$/g, '');
  const currentExt = extname(cleaned);

  if (cleaned.length === 0) {
    const fallbackExt = MIME_EXTENSION_MAP[mimeType] ?? (type === 'file' ? '.pdf' : '');
    return `attachment${fallbackExt}`;
  }

  if (currentExt.length > 0) {
    return cleaned;
  }

  const fallbackExt = MIME_EXTENSION_MAP[mimeType] ?? '';
  return `${cleaned}${fallbackExt}`;
}

async function resolveUniqueAttachmentPath(
  artifactDir: string,
  fileName: string
): Promise<{ absolutePath: string; relativePath: string }> {
  const uploadsDir = join(artifactDir, USER_ARTIFACTS_DIR);
  await ensureDir(uploadsDir);

  const ext = extname(fileName);
  const stem = ext.length > 0 ? fileName.slice(0, -ext.length) : fileName;

  let attempt = 0;
  while (true) {
    const nextFileName = attempt === 0 ? fileName : `${stem}-${attempt}${ext}`;
    const absolutePath = join(uploadsDir, nextFileName);

    if (!(await pathExists(absolutePath))) {
      return {
        absolutePath,
        relativePath: `${USER_ARTIFACTS_DIR}/${nextFileName}`,
      };
    }

    attempt += 1;
  }
}

async function persistUserAttachment(
  artifactDir: string,
  attachment: Attachment
): Promise<PersistedUserAttachment> {
  const fileName = sanitizeAttachmentFileName(
    attachment.fileName,
    attachment.mimeType,
    attachment.type
  );
  const { absolutePath, relativePath } = await resolveUniqueAttachmentPath(artifactDir, fileName);

  await writeFile(absolutePath, Buffer.from(attachment.content, 'base64'));

  return {
    attachment,
    artifactRelativePath: relativePath,
    artifactAbsolutePath: absolutePath,
  };
}

function buildSavedPathTextBlock(input: PersistedUserAttachment): TextContent {
  return {
    type: 'text',
    content: `Attachment "${input.attachment.fileName}" was saved to "${input.artifactAbsolutePath}" and can be referenced later if needed.`,
    metadata: {
      attachmentId: input.attachment.id,
      hiddenFromUI: true,
      kind: 'saved-attachment-path',
    },
  };
}

function buildPersistedAttachmentBlock(input: PersistedUserAttachment): FileContent | ImageContent {
  const sharedMetadata = {
    artifactAbsolutePath: input.artifactAbsolutePath,
    artifactRelativePath: input.artifactRelativePath,
    originalFileName: input.attachment.fileName,
    size: input.attachment.size ?? 0,
    source: 'user-upload',
  };

  if (input.attachment.type === 'image') {
    return {
      type: 'image',
      data: input.attachment.content,
      mimeType: input.attachment.mimeType,
      metadata: {
        fileName: input.attachment.fileName,
        ...sharedMetadata,
      },
    };
  }

  return {
    type: 'file',
    data: input.attachment.content,
    mimeType: input.attachment.mimeType,
    filename: input.attachment.fileName,
    metadata: {
      fileName: input.attachment.fileName,
      ...sharedMetadata,
    },
  };
}

export async function buildPromptUserMessage(input: {
  artifactDir: string;
  message: string;
  attachments?: Attachment[];
}): Promise<UserMessage> {
  const content: Content = [];

  if (input.message.length > 0) {
    content.push({
      type: 'text',
      content: input.message,
    });
  }

  for (const attachment of input.attachments ?? []) {
    const persisted = await persistUserAttachment(input.artifactDir, attachment);
    content.push(buildSavedPathTextBlock(persisted));
    content.push(buildPersistedAttachmentBlock(persisted));
  }

  return {
    role: 'user',
    id: randomUUID(),
    timestamp: Date.now(),
    content,
  };
}

export function cloneUserMessage(message: UserMessage): UserMessage {
  return {
    ...message,
    id: randomUUID(),
    timestamp: Date.now(),
    content: message.content.map(cloneContentBlock),
  };
}

export function getVisibleUserMessageText(message: UserMessage): string {
  return message.content
    .filter((block): block is TextContent => block.type === 'text' && !isHiddenTextBlock(block))
    .map((block) => block.content)
    .join('\n');
}

export function rewriteUserMessageVisibleText(message: UserMessage, nextText: string): UserMessage {
  const preservedBlocks = message.content
    .filter((block) => block.type !== 'text' || isHiddenTextBlock(block))
    .map(cloneContentBlock);

  const nextContent: Content =
    nextText.length > 0
      ? [{ type: 'text', content: nextText }, ...preservedBlocks]
      : preservedBlocks;

  return {
    ...message,
    id: randomUUID(),
    timestamp: Date.now(),
    content: nextContent,
  };
}
