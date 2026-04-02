import {
  createOngoingTurnCompactionPrompt,
  createTurnCompactionPrompt,
  createUltraCompactionPrompt,
} from '@ank1015/llm-agents';
import { getText, getToolCalls, llm, userMessage } from '@ank1015/llm-sdk';

import { appendSessionCompactionNode } from './compaction-storage.js';
import { estimateMessagesTokenCount } from './token-count.js';

import type { SessionTurnCompactionNode } from '../../types/index.js';
import type {
  Api,
  AssistantToolCall,
  BaseAssistantMessage,
  Content,
  Message,
} from '@ank1015/llm-sdk';

const TURN_COMPACTION_MODEL_ID = 'codex/gpt-5.4' as const;
const TURN_COMPACTION_REASONING_EFFORT = 'medium' as const;
const MIN_TOOL_TRACE_TOKENS_FOR_TURN_COMPACTION = 400;
const SESSION_COMPACTION_LOG_PREFIX = '[session-compaction]';
const SYSTEM_GENERATED_MESSAGE_START_TAG = '<max_system_generated_message>';
const SYSTEM_GENERATED_MESSAGE_END_TAG = '</max_system_generated_message>';
const COMPACTED_TURN_SUMMARY_START_TAG = '<compacted_turn_summary>';
const COMPACTED_TURN_SUMMARY_END_TAG = '</compacted_turn_summary>';
const MISSING_FINAL_ASSISTANT_REPLY_MESSAGE =
  'No final assistant message. The turn may have been aborted or interrupted by a connection or execution error.';

export interface PersistCompletedTurnCompactionInput {
  projectId: string;
  artifactDirId: string;
  sessionId: string;
  branchName: string;
  turnMessages: Message[];
}

export async function compactTurn(messages: Message[]): Promise<string> {
  validateTurnMessages(messages);

  const conversationMarkdown = buildTurnCompactionConversationMarkdown(messages);
  const response = await llm({
    modelId: TURN_COMPACTION_MODEL_ID,
    messages: [userMessage(conversationMarkdown)],
    system: createTurnCompactionPrompt(),
    reasoningEffort: TURN_COMPACTION_REASONING_EFFORT,
  });
  const summary = getText(response).trim();

  if (!summary) {
    throw new Error('Turn compaction response was empty');
  }

  return summary;
}

export async function compactOngoingTurn(messages: Message[]): Promise<string> {
  validateTurnMessages(messages);

  const conversationMarkdown = buildOngoingTurnCompactionConversationMarkdown(messages);
  const response = await llm({
    modelId: TURN_COMPACTION_MODEL_ID,
    messages: [userMessage(conversationMarkdown)],
    system: createOngoingTurnCompactionPrompt(),
    reasoningEffort: TURN_COMPACTION_REASONING_EFFORT,
  });
  const summary = getText(response).trim();

  if (!summary) {
    throw new Error('Ongoing turn compaction response was empty');
  }

  return summary;
}

export async function compactUltra(messages: Message[]): Promise<string> {
  validateUltraCompactionMessages(messages);

  const conversationMarkdown = buildUltraCompactionConversationMarkdown(messages);
  const response = await llm({
    modelId: TURN_COMPACTION_MODEL_ID,
    messages: [userMessage(conversationMarkdown)],
    system: createUltraCompactionPrompt(),
    reasoningEffort: TURN_COMPACTION_REASONING_EFFORT,
  });
  const summary = getText(response).trim();

  if (!summary) {
    throw new Error('Ultra compaction response was empty');
  }

  return summary;
}

export async function persistCompletedTurnCompaction(
  input: PersistCompletedTurnCompactionInput
): Promise<SessionTurnCompactionNode | null> {
  logCompactionInfo('Evaluating completed turn for compaction', {
    projectId: input.projectId,
    artifactDirId: input.artifactDirId,
    sessionId: input.sessionId,
    branchName: input.branchName,
    messageCount: input.turnMessages.length,
  });

  if (input.turnMessages.length < 2) {
    logCompactionInfo('Skipping completed turn compaction because the turn is too short', {
      sessionId: input.sessionId,
      branchName: input.branchName,
      messageCount: input.turnMessages.length,
    });
    return null;
  }

  const replacementSpan = getTurnCompactionReplacementSpan(input.turnMessages);
  if (!replacementSpan) {
    logCompactionInfo(
      'Skipping completed turn compaction because no replaceable internal trace messages were found',
      {
        sessionId: input.sessionId,
        branchName: input.branchName,
      }
    );
    return null;
  }

  const lastTurnMessage = input.turnMessages[input.turnMessages.length - 1];
  if (!lastTurnMessage || lastTurnMessage.role === 'user') {
    logCompactionInfo(
      'Skipping completed turn compaction because the turn ended on a user message',
      {
        sessionId: input.sessionId,
        branchName: input.branchName,
        lastMessageRole: lastTurnMessage?.role ?? null,
      }
    );
    return null;
  }

  const toolTraceMessages = getTurnToolTraceMessages(input.turnMessages);
  if (toolTraceMessages.length === 0) {
    logCompactionInfo(
      'Skipping completed turn compaction because no tool trace messages were found',
      {
        sessionId: input.sessionId,
        branchName: input.branchName,
      }
    );
    return null;
  }

  const toolTraceTokenCount = estimateMessagesTokenCount(toolTraceMessages);
  if (toolTraceTokenCount < MIN_TOOL_TRACE_TOKENS_FOR_TURN_COMPACTION) {
    logCompactionInfo(
      'Skipping completed turn compaction because tool trace is below token threshold',
      {
        sessionId: input.sessionId,
        branchName: input.branchName,
        toolTraceTokenCount,
        minToolTraceTokensForCompaction: MIN_TOOL_TRACE_TOKENS_FOR_TURN_COMPACTION,
        toolTraceMessageCount: toolTraceMessages.length,
      }
    );
    return null;
  }

  logCompactionInfo('Compacting completed turn', {
    sessionId: input.sessionId,
    branchName: input.branchName,
    toolTraceTokenCount,
    firstNodeId: replacementSpan.firstNodeId,
    lastNodeId: replacementSpan.lastNodeId,
  });

  const compactionSummary = await compactTurn(input.turnMessages);

  const node = await appendSessionCompactionNode(
    input.projectId,
    input.artifactDirId,
    input.sessionId,
    {
      type: 'turn_compact',
      branchName: input.branchName,
      firstNodeId: replacementSpan.firstNodeId,
      lastNodeId: replacementSpan.lastNodeId,
      compactionSummary,
    }
  );

  logCompactionInfo('Saved completed turn compaction node', {
    sessionId: input.sessionId,
    branchName: input.branchName,
    compactionNodeId: node.id,
    firstNodeId: node.firstNodeId,
    lastNodeId: node.lastNodeId,
  });

  return node;
}

function getTurnToolTraceMessages(messages: Message[]): Message[] {
  return messages.filter((message) => {
    if (message.role === 'toolResult') {
      return true;
    }

    return message.role === 'assistant' && getToolCalls(message).length > 0;
  });
}

function logCompactionInfo(message: string, details?: Record<string, unknown>): void {
  if (details) {
    console.info(`${SESSION_COMPACTION_LOG_PREFIX} ${message}`, details);
    return;
  }

  console.info(`${SESSION_COMPACTION_LOG_PREFIX} ${message}`);
}

function validateTurnMessages(messages: Message[]): void {
  if (messages.length === 0) {
    throw new Error('Cannot compact an empty turn');
  }

  if (messages[0]?.role !== 'user') {
    throw new Error('Turn compaction requires one or more user messages at the start of the turn');
  }

  let sawNonUserMessage = false;

  for (const message of messages) {
    if (message.role === 'user') {
      if (sawNonUserMessage) {
        throw new Error(
          'Turn compaction requires all user messages to appear before assistant or tool messages'
        );
      }
      continue;
    }

    sawNonUserMessage = true;

    if (message.role !== 'assistant' && message.role !== 'toolResult') {
      throw new Error(`Turn compaction does not support message role "${message.role}"`);
    }
  }
}

function validateUltraCompactionMessages(messages: Message[]): void {
  if (messages.length === 0) {
    throw new Error('Cannot ultra compact an empty message list');
  }

  if (messages[0]?.role !== 'user') {
    throw new Error('Ultra compaction requires the message list to start with a user message');
  }

  for (const message of messages) {
    if (message.role !== 'user' && message.role !== 'assistant') {
      throw new Error(
        `Ultra compaction only supports user and assistant messages, received "${message.role}"`
      );
    }
  }
}

function buildTurnCompactionConversationMarkdown(messages: Message[]): string {
  const { leadingUserMessages, remainingMessages } = splitLeadingUserMessages(messages);
  const finalAssistantReply = getFinalAssistantReply(remainingMessages);
  const processMessages =
    finalAssistantReply &&
    remainingMessages[remainingMessages.length - 1]?.id === finalAssistantReply.id
      ? remainingMessages.slice(0, -1)
      : remainingMessages;

  const sections: string[] = [];

  sections.push('## User messages');
  for (let index = 0; index < leadingUserMessages.length; index += 1) {
    sections.push(`### User message ${index + 1}`);
    sections.push(renderUserMessage(leadingUserMessages[index]!));
  }

  sections.push('## Assistant tool calls and results');
  const renderedProcessSections = renderAssistantProcessMessages(processMessages);
  if (renderedProcessSections.length === 0) {
    sections.push('No assistant tool calls or tool results.');
  } else {
    sections.push(...renderedProcessSections);
  }

  sections.push('## Final assistant reply');
  sections.push(
    finalAssistantReply
      ? renderAssistantReply(finalAssistantReply)
      : MISSING_FINAL_ASSISTANT_REPLY_MESSAGE
  );

  return sections.join('\n\n');
}

function buildOngoingTurnCompactionConversationMarkdown(messages: Message[]): string {
  const { leadingUserMessages, remainingMessages } = splitLeadingUserMessages(messages);
  const sections: string[] = [];

  sections.push('## User messages');
  for (let index = 0; index < leadingUserMessages.length; index += 1) {
    sections.push(`### User message ${index + 1}`);
    sections.push(renderUserMessage(leadingUserMessages[index]!));
  }

  sections.push('## Assistant tool calls and results');
  const renderedProcessSections = renderAssistantProcessMessages(remainingMessages);
  if (renderedProcessSections.length === 0) {
    sections.push('No assistant tool calls or tool results.');
  } else {
    sections.push(...renderedProcessSections);
  }

  return sections.join('\n\n');
}

function buildUltraCompactionConversationMarkdown(messages: Message[]): string {
  const sections: string[] = [];

  for (const message of messages) {
    if (message.role === 'user') {
      const renderedUserMessage = renderUserMessage(message);
      const systemGeneratedSummary = extractSystemGeneratedSummary(renderedUserMessage);

      if (systemGeneratedSummary !== null) {
        sections.push('### Assistant turn summary');
        sections.push(systemGeneratedSummary || '(empty assistant turn summary)');
        continue;
      }

      sections.push('## User message');
      sections.push(renderedUserMessage || '(empty user message)');
      continue;
    }

    if (message.role !== 'assistant') {
      continue;
    }

    sections.push('## Assistant reply');
    sections.push(renderAssistantResponseContent(message) || '(empty assistant reply)');
  }

  return sections.join('\n\n');
}

export function splitLeadingUserMessages(messages: Message[]): {
  leadingUserMessages: Extract<Message, { role: 'user' }>[];
  remainingMessages: Message[];
} {
  const leadingUserMessages: Extract<Message, { role: 'user' }>[] = [];
  let firstNonUserIndex = messages.length;

  for (let index = 0; index < messages.length; index += 1) {
    const message = messages[index];
    if (message?.role !== 'user') {
      firstNonUserIndex = index;
      break;
    }

    leadingUserMessages.push(message);
  }

  return {
    leadingUserMessages,
    remainingMessages: messages.slice(firstNonUserIndex),
  };
}

export function getFinalAssistantReply(messages: Message[]): BaseAssistantMessage<Api> | null {
  const lastMessage = messages[messages.length - 1];
  if (lastMessage?.role !== 'assistant') {
    return null;
  }

  if (getToolCalls(lastMessage).length > 0) {
    return null;
  }

  return renderAssistantResponseContent(lastMessage).trim().length > 0 ? lastMessage : null;
}

export function getTurnCompactionReplacementSpan(messages: Message[]): {
  firstNodeId: string;
  lastNodeId: string;
} | null {
  const { remainingMessages } = splitLeadingUserMessages(messages);
  const firstAssistantMessage = remainingMessages.find(
    (message): message is BaseAssistantMessage<Api> => message.role === 'assistant'
  );
  if (!firstAssistantMessage) {
    return null;
  }

  const finalAssistantReply = getFinalAssistantReply(remainingMessages);
  const replaceableMessages =
    finalAssistantReply &&
    remainingMessages[remainingMessages.length - 1]?.id === finalAssistantReply.id
      ? remainingMessages.slice(0, -1)
      : remainingMessages;
  const lastReplaceableMessage = replaceableMessages[replaceableMessages.length - 1];

  if (!lastReplaceableMessage || lastReplaceableMessage.role === 'user') {
    return null;
  }

  return {
    firstNodeId: firstAssistantMessage.id,
    lastNodeId: lastReplaceableMessage.id,
  };
}

function renderAssistantProcessMessages(messages: Message[]): string[] {
  const sections: string[] = [];

  for (const message of messages) {
    if (message.role === 'assistant') {
      const assistantNote = renderAssistantResponseContent(message);
      if (assistantNote) {
        sections.push('### Assistant note');
        sections.push(assistantNote);
      }

      for (const toolCall of getToolCalls(message)) {
        sections.push(`### Tool call: ${toolCall.name}`);
        sections.push(renderToolCall(toolCall));
      }

      continue;
    }

    if (message.role !== 'toolResult') {
      continue;
    }

    sections.push(`### Tool result: ${message.toolName}`);
    sections.push(renderToolResult(message));
  }

  return sections;
}

function renderUserMessage(message: Extract<Message, { role: 'user' }>): string {
  const rendered = renderContentBlocks(message.content, {
    hideHiddenText: true,
    fileLabel: 'file attachment',
    imageLabel: 'image attachment',
  });
  return rendered || '(empty user message)';
}

function renderAssistantReply(message: BaseAssistantMessage<Api>): string {
  const rendered = renderAssistantResponseContent(message);
  return rendered || MISSING_FINAL_ASSISTANT_REPLY_MESSAGE;
}

function renderAssistantResponseContent(message: BaseAssistantMessage<Api>): string {
  const parts: string[] = [];

  for (const item of message.content) {
    if (item.type !== 'response') {
      continue;
    }

    const rendered = renderContentBlocks(item.response, {
      hideHiddenText: false,
      fileLabel: 'file output',
      imageLabel: 'image output',
    });
    if (rendered) {
      parts.push(rendered);
    }
  }

  return parts.join('\n\n').trim();
}

function renderToolCall(toolCall: AssistantToolCall): string {
  return [
    `Tool name: ${toolCall.name}`,
    'Arguments:',
    '```json',
    JSON.stringify(toolCall.arguments, null, 2),
    '```',
  ].join('\n');
}

function renderToolResult(message: Extract<Message, { role: 'toolResult' }>): string {
  const renderedContent = renderContentBlocks(message.content, {
    hideHiddenText: false,
    fileLabel: 'file output',
    imageLabel: 'image output',
  });
  const parts: string[] = [];

  parts.push(`Status: ${message.isError ? 'error' : 'success'}`);
  if (message.error?.message) {
    parts.push(`Error: ${message.error.message}`);
  }
  parts.push(renderedContent || '(empty tool result)');

  return parts.join('\n\n');
}

function renderContentBlocks(
  content: Content,
  options: {
    hideHiddenText: boolean;
    fileLabel: string;
    imageLabel: string;
  }
): string {
  const parts: string[] = [];

  for (const block of content) {
    if (block.type === 'text') {
      if (options.hideHiddenText && block.metadata?.hiddenFromUI === true) {
        continue;
      }
      if (block.content.trim().length > 0) {
        parts.push(block.content);
      }
      continue;
    }

    const metadataPath = resolveContentPath(block.metadata);
    if (block.type === 'file') {
      const fileName =
        block.filename || resolveMetadataString(block.metadata, 'fileName') || 'unknown file';
      parts.push(
        metadataPath
          ? `[${options.fileLabel}: ${fileName} | path: ${metadataPath}]`
          : `[${options.fileLabel}: ${fileName}]`
      );
      continue;
    }

    const imageName = resolveMetadataString(block.metadata, 'fileName') || 'unknown image';
    parts.push(
      metadataPath
        ? `[${options.imageLabel}: ${imageName} | path: ${metadataPath}]`
        : `[${options.imageLabel}: ${imageName}]`
    );
  }

  return parts.join('\n\n').trim();
}

function extractSystemGeneratedSummary(content: string): string | null {
  const trimmedContent = content.trim();
  if (
    !trimmedContent.startsWith(SYSTEM_GENERATED_MESSAGE_START_TAG) ||
    !trimmedContent.endsWith(SYSTEM_GENERATED_MESSAGE_END_TAG)
  ) {
    return null;
  }

  const extractedContent = trimmedContent
    .slice(
      SYSTEM_GENERATED_MESSAGE_START_TAG.length,
      trimmedContent.length - SYSTEM_GENERATED_MESSAGE_END_TAG.length
    )
    .trim();

  if (
    extractedContent.startsWith(COMPACTED_TURN_SUMMARY_START_TAG) &&
    extractedContent.endsWith(COMPACTED_TURN_SUMMARY_END_TAG)
  ) {
    return extractedContent
      .slice(
        COMPACTED_TURN_SUMMARY_START_TAG.length,
        extractedContent.length - COMPACTED_TURN_SUMMARY_END_TAG.length
      )
      .trim();
  }

  return extractedContent;
}

function resolveContentPath(metadata: Record<string, unknown> | undefined): string | null {
  return (
    resolveMetadataString(metadata, 'artifactAbsolutePath') ||
    resolveMetadataString(metadata, 'artifactRelativePath') ||
    resolveMetadataString(metadata, 'path') ||
    null
  );
}

function resolveMetadataString(
  metadata: Record<string, unknown> | undefined,
  key: string
): string | null {
  const value = metadata?.[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}
