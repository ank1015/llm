import { existsSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type {
  Api,
  AssistantToolCall,
  BaseAssistantMessage,
  Content,
  Message,
  ToolResultMessage,
  UserMessage,
} from '@ank1015/llm-sdk';

const currentFileDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = findPackageRoot(currentFileDir);
const sessionsRootDir = join(packageRoot, '.sessions');

export interface SaveCliSessionMarkdownOptions {
  sessionId: string;
  sessionName: string;
  projectName: string;
  workingDir: string;
  archiveSubdir: string;
  messages: Message[];
  rootDir?: string;
  savedAt?: Date;
}

export function formatMessageContent(content: Content): string {
  return content
    .map((block) => {
      switch (block.type) {
        case 'text':
          return block.content;
        case 'image':
          return `[Image attachment: ${block.mimeType}]`;
        case 'file':
          return `[File attachment: ${block.filename}]`;
        default:
          return '[Unknown content type]';
      }
    })
    .join('\n');
}

export function formatToolCall(toolCall: AssistantToolCall): string {
  return `**Tool Call: ${toolCall.name}**\n\`\`\`json\n${truncateForMarkdown(
    JSON.stringify(toolCall.arguments ?? {}, null, 2)
  )}\n\`\`\``;
}

export function formatConversationAsMarkdown(messages: Message[]): string {
  const parts: string[] = [];
  let assistantCount = 0;
  let isFirstUser = true;

  for (const message of messages) {
    switch (message.role) {
      case 'user':
        parts.push(formatUserMessage(message, isFirstUser));
        isFirstUser = false;
        break;
      case 'assistant':
        parts.push(formatAssistantMessage(message, assistantCount));
        assistantCount += 1;
        break;
      case 'toolResult':
        parts.push(formatToolResultMessage(message));
        break;
      case 'custom':
        parts.push(formatCustomMessage(message));
        break;
    }
  }

  return parts.join('\n\n---\n\n');
}

export function buildCliSessionMarkdown({
  sessionId,
  sessionName,
  projectName,
  workingDir,
  messages,
  savedAt = new Date(),
}: Omit<SaveCliSessionMarkdownOptions, 'archiveSubdir' | 'rootDir'> & {
  savedAt?: Date;
}): string {
  const conversation = formatConversationAsMarkdown(messages);

  return `# ${sessionName}

- Session ID: ${sessionId}
- Project: ${projectName}
- Working Directory: ${workingDir}
- Saved At: ${savedAt.toISOString()}

## Conversation

${conversation || '_No conversation messages captured._'}
`;
}

export async function saveCliSessionMarkdown(
  options: SaveCliSessionMarkdownOptions
): Promise<string | undefined> {
  if (options.messages.length === 0) {
    return undefined;
  }

  const savedAt = options.savedAt ?? new Date();
  const outputDir = join(options.rootDir ?? sessionsRootDir, options.archiveSubdir);
  const filename = `${formatTimestamp(savedAt)}-${slugify(options.sessionName)}-${options.sessionId}.md`;
  const filePath = join(outputDir, filename);
  const markdown = buildCliSessionMarkdown({
    sessionId: options.sessionId,
    sessionName: options.sessionName,
    projectName: options.projectName,
    workingDir: options.workingDir,
    messages: options.messages,
    savedAt,
  });

  await mkdir(outputDir, { recursive: true });
  await writeFile(filePath, markdown, 'utf-8');
  return filePath;
}

function formatAssistantMessage(message: BaseAssistantMessage<Api>, index: number): string {
  const parts: string[] = [];
  parts.push(`### Assistant Response #${index + 1}`);
  parts.push(`*Model: ${message.api}/${message.model.id}*`);
  parts.push(`*Stop Reason: ${message.stopReason}*`);

  for (const block of message.content) {
    if (block.type === 'response') {
      const text = formatMessageContent(block.content);
      if (text.trim()) {
        parts.push(text);
      }
      continue;
    }

    if (block.type === 'thinking') {
      parts.push(`<thinking>\n${block.thinkingText}\n</thinking>`);
      continue;
    }

    parts.push(formatToolCall(block));
  }

  if (message.errorMessage) {
    parts.push(`**Error Received:** ${message.errorMessage}`);
  }

  return parts.join('\n\n');
}

function formatToolResultMessage(message: ToolResultMessage): string {
  const status = message.isError ? 'ERROR' : 'SUCCESS';
  const content = formatMessageContent(message.content);
  const parts = [`### Tool Result: ${message.toolName} [${status}]`];

  if (message.isError && message.error?.message) {
    parts.push(`**Error:** ${message.error.message}`);
  }

  parts.push(`\`\`\`\n${truncateForMarkdown(content)}\n\`\`\``);
  return parts.join('\n\n');
}

function formatUserMessage(message: UserMessage, isFirstUser: boolean): string {
  const header = isFirstUser ? '### Task (User Request)' : '### User Message';
  const content = formatMessageContent(message.content);
  return `${header}\n\n${content}`;
}

function formatCustomMessage(message: Extract<Message, { role: 'custom' }>): string {
  return `### Custom Message\n\n\`\`\`json\n${truncateForMarkdown(
    JSON.stringify(message.content, null, 2)
  )}\n\`\`\``;
}

function truncateForMarkdown(value: string, maxLength = 8_000): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n... [truncated]`;
}

function formatTimestamp(value: Date): string {
  return value.toISOString().replace(/[:.]/g, '-');
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return slug || basename(packageRoot);
}

function findPackageRoot(startDir: string): string {
  let dir = startDir;

  while (true) {
    if (existsSync(join(dir, 'package.json'))) {
      return dir;
    }

    const parentDir = dirname(dir);
    if (parentDir === dir) {
      throw new Error(`Unable to locate package root from ${startDir}`);
    }

    dir = parentDir;
  }
}
