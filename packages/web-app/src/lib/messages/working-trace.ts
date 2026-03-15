import type {
  AgentEvent,
  Api,
  BaseAssistantMessage,
  Content,
  FileContent,
  ImageContent,
  Message,
  MessageNode,
} from '@ank1015/llm-types';

type AssistantStreamingMessage = Omit<BaseAssistantMessage<Api>, 'message'>;
type CotRenderableMessage = Message | AssistantStreamingMessage;

type WorkingTraceFormat = 'plain' | 'markdown';
type WorkingToolStatus = 'running' | 'done' | 'error';

export type WorkingTraceThinkingItem = {
  id: string;
  type: 'thinking';
  title: string;
  body: string;
  format: WorkingTraceFormat;
};

export type WorkingTraceAssistantNoteItem = {
  id: string;
  type: 'assistant_note';
  body: string;
};

export type WorkingToolEntry = {
  id: string;
  type: 'tool';
  toolCallId: string;
  toolName: string;
  title: string;
  args: unknown;
  status: WorkingToolStatus;
  content: Content;
  details?: unknown;
  errorText?: string;
};

export type WorkingTraceItem =
  | WorkingTraceThinkingItem
  | WorkingTraceAssistantNoteItem
  | WorkingToolEntry;

export type WorkingTraceModel = {
  items: WorkingTraceItem[];
  finalResponseText: string | null;
};

type BuildWorkingTraceInput = {
  cotMessages: CotRenderableMessage[];
  assistantNode: MessageNode | null;
  isStreamingTurn: boolean;
  streamingAssistant: AssistantStreamingMessage | null;
  agentEvents: AgentEvent[];
  api: Api | null;
};

type ToolEntrySeed = {
  toolCallId: string;
  toolName: string;
  title: string;
  args: unknown;
  status: WorkingToolStatus;
};

type ToolResultState = {
  content: Content;
  details?: unknown;
  isError: boolean;
  errorText?: string;
};

const STRUCTURED_THINKING_APIS: ReadonlySet<Api> = new Set<Api>([
  'google',
  'openai',
  'codex',
  'deepseek',
]);

function isBoldHeading(text: string): boolean {
  const trimmed = text.trim();
  return trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4;
}

function stripBold(text: string): string {
  return text.replace(/^\*\*|\*\*$/g, '').trim();
}

function splitThinkingIntoItems(
  text: string,
  messageId: string,
  api: Api | null
): WorkingTraceThinkingItem[] {
  if (!api || !STRUCTURED_THINKING_APIS.has(api)) {
    return [
      {
        id: `${messageId}-thinking-markdown`,
        type: 'thinking',
        title: '',
        body: text.trim(),
        format: 'markdown',
      },
    ];
  }

  const paragraphs = text
    .split(/\n\n+/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const items: WorkingTraceThinkingItem[] = [];
  let index = 0;

  while (index < paragraphs.length) {
    const paragraph = paragraphs[index];
    if (!paragraph) {
      index += 1;
      continue;
    }

    if (isBoldHeading(paragraph)) {
      const title = stripBold(paragraph);
      const body = index + 1 < paragraphs.length ? (paragraphs[index + 1] ?? '') : '';
      items.push({
        id: `${messageId}-thinking-${index}`,
        type: 'thinking',
        title,
        body,
        format: 'plain',
      });
      index += body ? 2 : 1;
      continue;
    }

    const newlineIndex = paragraph.indexOf('\n');
    if (newlineIndex === -1) {
      items.push({
        id: `${messageId}-thinking-${index}`,
        type: 'thinking',
        title: paragraph,
        body: '',
        format: 'plain',
      });
      index += 1;
      continue;
    }

    items.push({
      id: `${messageId}-thinking-${index}`,
      type: 'thinking',
      title: paragraph.slice(0, newlineIndex).trim(),
      body: paragraph.slice(newlineIndex + 1).trim(),
      format: 'plain',
    });
    index += 1;
  }

  return items;
}

function extractAssistantResponseText(
  message: Pick<BaseAssistantMessage<Api>, 'content'>
): string | null {
  const responseText = message.content
    .filter(
      (
        block
      ): block is Extract<BaseAssistantMessage<Api>['content'][number], { type: 'response' }> => {
        return block.type === 'response';
      }
    )
    .map((block) =>
      block.content
        .filter((part): part is Extract<(typeof block.content)[number], { type: 'text' }> => {
          return part.type === 'text';
        })
        .map((part) => part.content)
        .join('')
    )
    .join('\n\n')
    .trim();

  return responseText.length > 0 ? responseText : null;
}

function extractToolTextContent(content: Content): string {
  return content
    .filter((part): part is Extract<Content[number], { type: 'text' }> => part.type === 'text')
    .map((part) => part.content)
    .join('\n')
    .trim();
}

function extractToolImages(content: Content): ImageContent[] {
  return content.filter((part): part is ImageContent => part.type === 'image');
}

function extractToolFiles(content: Content): FileContent[] {
  return content.filter((part): part is FileContent => part.type === 'file');
}

function truncateInline(text: string, maxLength: number = 64): string {
  if (text.length <= maxLength) {
    return text;
  }

  return `${text.slice(0, Math.max(0, maxLength - 1)).trimEnd()}…`;
}

function getPathArg(args: unknown): string | null {
  if (typeof args !== 'object' || args === null || !('path' in args)) {
    return null;
  }

  const path = (args as { path?: unknown }).path;
  return typeof path === 'string' && path.trim().length > 0 ? path : null;
}

function getStringArg(args: unknown, key: string): string | null {
  if (typeof args !== 'object' || args === null || !(key in args)) {
    return null;
  }

  const value = (args as Record<string, unknown>)[key];
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
}

function formatToolTitle(toolName: string, args: unknown): string {
  switch (toolName) {
    case 'read':
      return `read ${getPathArg(args) ?? 'file'}`;
    case 'write':
      return `write ${getPathArg(args) ?? 'file'}`;
    case 'edit':
      return `edit ${getPathArg(args) ?? 'file'}`;
    case 'bash':
      return `bash ${truncateInline(getStringArg(args, 'command') ?? 'command')}`;
    case 'ls':
      return `list ${getPathArg(args) ?? '.'}`;
    case 'find':
      return `find ${truncateInline(getStringArg(args, 'pattern') ?? 'pattern')}`;
    case 'grep':
      return `grep ${truncateInline(getStringArg(args, 'pattern') ?? 'pattern')}`;
    default:
      return toolName.toLowerCase();
  }
}

function hasToolCalls(message: Pick<BaseAssistantMessage<Api>, 'content'>): boolean {
  return message.content.some((block) => block.type === 'toolCall');
}

function getAssistantFromMessageEndEvent(event: AgentEvent): BaseAssistantMessage<Api> | null {
  if (event.type !== 'message_end' || event.messageType !== 'assistant') {
    return null;
  }

  return event.message.role === 'assistant' ? (event.message as BaseAssistantMessage<Api>) : null;
}

function getLiveEndedAssistants(
  agentEvents: AgentEvent[],
  excludedIds: ReadonlySet<string>,
  currentStreamingId: string | null
): BaseAssistantMessage<Api>[] {
  const assistants: BaseAssistantMessage<Api>[] = [];
  const seenIds = new Set<string>();

  for (const event of agentEvents) {
    const assistant = getAssistantFromMessageEndEvent(event);
    if (!assistant) {
      continue;
    }

    if (
      excludedIds.has(assistant.id) ||
      assistant.id === currentStreamingId ||
      seenIds.has(assistant.id)
    ) {
      continue;
    }

    seenIds.add(assistant.id);
    assistants.push(assistant);
  }

  return assistants;
}

function getLastLiveFinalAssistant(
  liveAssistants: readonly BaseAssistantMessage<Api>[]
): BaseAssistantMessage<Api> | null {
  for (let index = liveAssistants.length - 1; index >= 0; index -= 1) {
    const candidate = liveAssistants[index];
    if (candidate && !hasToolCalls(candidate)) {
      return candidate;
    }
  }

  return null;
}

function upsertToolEntry(
  items: WorkingTraceItem[],
  toolEntriesById: Map<string, WorkingToolEntry>,
  seed: ToolEntrySeed
): WorkingToolEntry {
  const existing = toolEntriesById.get(seed.toolCallId);
  if (existing) {
    existing.toolName = existing.toolName || seed.toolName;
    existing.title = existing.title || seed.title;
    existing.args = existing.args ?? seed.args;
    if (existing.status !== 'error') {
      existing.status = seed.status;
    }
    return existing;
  }

  const entry: WorkingToolEntry = {
    id: `${seed.toolCallId}-tool`,
    type: 'tool',
    toolCallId: seed.toolCallId,
    toolName: seed.toolName,
    title: seed.title,
    args: seed.args,
    status: seed.status,
    content: [],
  };
  toolEntriesById.set(seed.toolCallId, entry);
  items.push(entry);
  return entry;
}

function applyToolResult(entry: WorkingToolEntry, result: ToolResultState): void {
  entry.content = result.content;
  entry.details = result.details;
  entry.status = result.isError ? 'error' : 'done';
  entry.errorText = result.errorText;
}

function appendAssistantMessageToTrace(input: {
  message: Pick<BaseAssistantMessage<Api>, 'id' | 'content'>;
  api: Api | null;
  isFinalCandidate: boolean;
  isLiveTurn: boolean;
  items: WorkingTraceItem[];
  toolEntriesById: Map<string, WorkingToolEntry>;
  finalResponseParts: string[];
}): void {
  for (let index = 0; index < input.message.content.length; index += 1) {
    const block = input.message.content[index];
    if (!block) {
      continue;
    }

    if (block.type === 'thinking') {
      input.items.push(
        ...splitThinkingIntoItems(block.thinkingText, `${input.message.id}-${index}`, input.api)
      );
      continue;
    }

    if (block.type === 'response') {
      const text = block.content
        .filter((part): part is Extract<(typeof block.content)[number], { type: 'text' }> => {
          return part.type === 'text';
        })
        .map((part) => part.content)
        .join('')
        .trim();

      if (text.length === 0) {
        continue;
      }

      if (input.isFinalCandidate) {
        input.finalResponseParts.push(text);
        continue;
      }

      input.items.push({
        id: `${input.message.id}-assistant-note-${index}`,
        type: 'assistant_note',
        body: text,
      });
      continue;
    }

    if (block.type === 'toolCall') {
      upsertToolEntry(input.items, input.toolEntriesById, {
        toolCallId: block.toolCallId,
        toolName: block.name,
        title: formatToolTitle(block.name, block.arguments),
        args: block.arguments,
        status: input.isLiveTurn ? 'running' : 'done',
      });
    }
  }
}

export function buildWorkingTraceModel(input: BuildWorkingTraceInput): WorkingTraceModel {
  const items: WorkingTraceItem[] = [];
  const toolEntriesById = new Map<string, WorkingToolEntry>();
  const finalResponseParts: string[] = [];

  const persistedAssistantIds = new Set<string>();
  for (const message of input.cotMessages) {
    if (message.role === 'assistant') {
      persistedAssistantIds.add(message.id);
    }
  }

  const currentStreamingId = input.streamingAssistant?.id ?? null;
  const liveEndedAssistants = input.isStreamingTurn
    ? getLiveEndedAssistants(input.agentEvents, persistedAssistantIds, currentStreamingId)
    : [];

  const persistedFinalAssistant =
    input.assistantNode?.message.role === 'assistant'
      ? (input.assistantNode.message as BaseAssistantMessage<Api>)
      : null;
  const liveFinalAssistant = persistedFinalAssistant
    ? null
    : getLastLiveFinalAssistant(liveEndedAssistants);
  const finalAssistantId = persistedFinalAssistant?.id ?? liveFinalAssistant?.id ?? null;

  for (const message of input.cotMessages) {
    if (message.role === 'assistant') {
      appendAssistantMessageToTrace({
        message,
        api: input.api,
        isFinalCandidate: message.id === finalAssistantId,
        isLiveTurn: input.isStreamingTurn,
        items,
        toolEntriesById,
        finalResponseParts,
      });
      continue;
    }

    if (message.role !== 'toolResult') {
      continue;
    }

    const entry = upsertToolEntry(items, toolEntriesById, {
      toolCallId: message.toolCallId,
      toolName: message.toolName,
      title: formatToolTitle(message.toolName, undefined),
      args: undefined,
      status: message.isError ? 'error' : 'done',
    });

    applyToolResult(entry, {
      content: message.content,
      details: message.details,
      isError: message.isError,
      errorText: message.error?.message,
    });
  }

  for (const assistant of liveEndedAssistants) {
    appendAssistantMessageToTrace({
      message: assistant,
      api: input.api,
      isFinalCandidate: assistant.id === finalAssistantId,
      isLiveTurn: input.isStreamingTurn,
      items,
      toolEntriesById,
      finalResponseParts,
    });
  }

  if (
    input.isStreamingTurn &&
    input.streamingAssistant &&
    input.streamingAssistant.id !== finalAssistantId &&
    !persistedAssistantIds.has(input.streamingAssistant.id)
  ) {
    appendAssistantMessageToTrace({
      message: input.streamingAssistant,
      api: input.api,
      isFinalCandidate: false,
      isLiveTurn: true,
      items,
      toolEntriesById,
      finalResponseParts,
    });
  }

  for (const event of input.agentEvents) {
    if (event.type === 'tool_execution_start') {
      upsertToolEntry(items, toolEntriesById, {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        title: formatToolTitle(event.toolName, event.args),
        args: event.args,
        status: 'running',
      });
      continue;
    }

    if (event.type === 'tool_execution_update') {
      const entry = upsertToolEntry(items, toolEntriesById, {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        title: formatToolTitle(event.toolName, event.args),
        args: event.args,
        status: 'running',
      });
      applyToolResult(entry, {
        content: event.partialResult.content,
        details: event.partialResult.details,
        isError: false,
      });
      entry.status = 'running';
      continue;
    }

    if (event.type === 'tool_execution_end') {
      const entry = upsertToolEntry(items, toolEntriesById, {
        toolCallId: event.toolCallId,
        toolName: event.toolName,
        title: formatToolTitle(event.toolName, undefined),
        args: undefined,
        status: event.isError ? 'error' : 'done',
      });
      applyToolResult(entry, {
        content: event.result.content,
        details: event.result.details,
        isError: event.isError,
      });
    }
  }

  const assistantNodeResponse =
    persistedFinalAssistant && finalResponseParts.length === 0
      ? extractAssistantResponseText(persistedFinalAssistant)
      : null;

  return {
    items,
    finalResponseText: finalResponseParts.join('\n\n').trim() || assistantNodeResponse,
  };
}

export function getWorkingTraceTextContent(content: Content): string {
  return extractToolTextContent(content);
}

export function getWorkingTraceImages(content: Content): ImageContent[] {
  return extractToolImages(content);
}

export function getWorkingTraceFiles(content: Content): FileContent[] {
  return extractToolFiles(content);
}
