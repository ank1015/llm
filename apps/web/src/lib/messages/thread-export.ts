
import type { MessageNode } from '@/stores/types';
import type { Api, Content, UserMessage } from '@ank1015/llm-sdk';

import { getTextFromUserMessage } from '@/lib/messages/utils';
import {
  buildWorkingTraceModel,
  getWorkingTraceFiles,
  getWorkingTraceImages,
  getWorkingTraceTextContent,
} from '@/lib/messages/working-trace';

export type ExportableThreadTurn = {
  userNode: MessageNode | null;
  cotMessages: Array<MessageNode['message']>;
  assistantNode: MessageNode | null;
  api: Api | null;
};

function getAttachmentMetadataValue(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function wrapCodeBlock(text: string, language: string): string {
  const fence = text.includes('```') ? '````' : '```';
  return `${fence}${language}\n${text}\n${fence}`;
}

function stringifyUnknown(value: unknown): { text: string; language: string } | null {
  if (value === undefined) {
    return null;
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed.length > 0 ? { text: trimmed, language: 'text' } : null;
  }

  try {
    const text = JSON.stringify(value, null, 2);
    return text ? { text, language: 'json' } : null;
  } catch {
    return null;
  }
}

function formatSection(heading: string, body: string | null): string {
  const trimmedBody = body?.trim() ?? '';
  return trimmedBody.length > 0 ? `## ${heading}\n\n${trimmedBody}` : `## ${heading}`;
}

function formatUserAttachments(message: UserMessage): string | null {
  const lines = message.content
    .filter(
      (block): block is Extract<UserMessage['content'][number], { type: 'image' | 'file' }> => {
        return block.type === 'image' || block.type === 'file';
      }
    )
    .map((block, index) => {
      const fileName =
        getAttachmentMetadataValue(block.metadata, 'originalFileName') ??
        getAttachmentMetadataValue(block.metadata, 'fileName') ??
        (block.type === 'file' ? block.filename : `image-${index + 1}`);

      return `- ${block.type === 'image' ? 'Image' : 'File'}: \`${fileName}\` (${block.mimeType})`;
    });

  return lines.length > 0 ? lines.join('\n') : null;
}

function formatUserMessageSection(message: UserMessage): string {
  const bodyParts: string[] = [];
  const text = getTextFromUserMessage(message).trim();
  const attachments = formatUserAttachments(message);

  if (text.length > 0) {
    bodyParts.push(text);
  }

  if (attachments) {
    bodyParts.push(formatSection('Attachments', attachments));
  }

  return bodyParts.length > 0 ? `# User message\n\n${bodyParts.join('\n\n')}` : '# User message';
}

function formatToolCallSection(input: { toolName: string; title: string; args: unknown }): string {
  const bodyParts = [`Tool: \`${input.toolName}\``, `Call: \`${input.title}\``];
  const args = stringifyUnknown(input.args);

  if (args) {
    bodyParts.push(`Arguments:\n${wrapCodeBlock(args.text, args.language)}`);
  }

  return bodyParts.join('\n\n');
}

function formatToolResultSection(input: {
  content: Content;
  details?: unknown;
  errorText?: string;
  status: 'running' | 'done' | 'error';
}): string {
  const bodyParts = [
    `Status: ${input.status === 'error' ? 'Error' : input.status === 'running' ? 'Running' : 'Success'}`,
  ];
  const textContent = getWorkingTraceTextContent(input.content).trim();
  const details = stringifyUnknown(input.details);
  const files = getWorkingTraceFiles(input.content);
  const images = getWorkingTraceImages(input.content);
  const errorText = input.errorText?.trim() ?? '';

  if (textContent.length > 0) {
    bodyParts.push(wrapCodeBlock(textContent, 'text'));
  } else if (errorText.length > 0) {
    bodyParts.push(wrapCodeBlock(errorText, 'text'));
  }

  if (details && details.text !== textContent) {
    bodyParts.push(`Details:\n${wrapCodeBlock(details.text, details.language)}`);
  }

  if (files.length > 0 || images.length > 0) {
    const mediaLines = [
      ...images.map((_image, index) => `- Image result ${index + 1}`),
      ...files.map((file) => `- File result: \`${file.filename}\` (${file.mimeType})`),
    ];
    bodyParts.push(mediaLines.join('\n'));
  }

  return bodyParts.join('\n\n');
}

function formatAssistantMessageSection(turn: ExportableThreadTurn): string | null {
  if (!turn.assistantNode || turn.assistantNode.message.role !== 'assistant') {
    return null;
  }

  const trace = buildWorkingTraceModel({
    cotMessages: turn.cotMessages,
    assistantNode: turn.assistantNode,
    isStreamingTurn: false,
    streamingAssistant: null,
    agentEvents: [],
    api: turn.api,
  });
  const sections: string[] = [];

  for (const item of trace.items) {
    if (item.type === 'thinking') {
      continue;
    }

    if (item.type === 'assistant_note') {
      const body = item.body.trim();
      if (body.length > 0) {
        sections.push(formatSection('Assistant note', body));
      }
      continue;
    }

    sections.push(
      formatSection(
        'Tool Call',
        formatToolCallSection({
          toolName: item.toolName,
          title: item.title,
          args: item.args,
        })
      )
    );
    sections.push(
      formatSection(
        'Tool Result',
        formatToolResultSection({
          content: item.content,
          details: item.details,
          errorText: item.errorText,
          status: item.status,
        })
      )
    );
  }

  const response = trace.finalResponseText?.trim() ?? '';
  if (response.length > 0) {
    sections.push(formatSection('Response', response));
  }

  if (sections.length === 0) {
    return null;
  }

  return `# Assistant message\n\n${sections.join('\n\n')}`;
}

export function formatThreadMarkdownExport(input: {
  turns: readonly ExportableThreadTurn[];
  endTurnIndex: number;
  systemPrompt?: string | null;
}): string {
  const sections: string[] = [];
  const systemPrompt = input.systemPrompt?.trim() ?? '';

  if (systemPrompt.length > 0) {
    sections.push(`# System prompt\n\n${systemPrompt}`);
  }

  for (const turn of input.turns.slice(0, input.endTurnIndex + 1)) {
    if (turn.userNode?.message.role === 'user') {
      sections.push(formatUserMessageSection(turn.userNode.message as UserMessage));
    }

    const assistantSection = formatAssistantMessageSection(turn);
    if (assistantSection) {
      sections.push(assistantSection);
    }
  }

  return sections.join('\n\n');
}
