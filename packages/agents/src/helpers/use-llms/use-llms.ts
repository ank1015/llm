import {
  Conversation,
  createSessionManager,
  getModel,
  stream as sdkStream,
} from '@ank1015/llm-sdk';
import {
  createFileKeysAdapter,
  createFileSessionsAdapter,
  InMemorySessionsAdapter,
} from '@ank1015/llm-sdk-adapters';

import type {
  AgentState,
  AgentTool,
  Api,
  AssistantMessageEventStream,
  BaseAssistantEvent,
  BaseAssistantMessage,
  Context,
  Message,
  Model,
  Provider,
  SessionManager,
  Tool,
  UserMessage,
} from '@ank1015/llm-sdk';
import type { FileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

const defaultKeysAdapter = createFileKeysAdapter();

export const USE_LLMS_MODEL_IDS = ['gpt-5.4', 'gpt-5.4-mini'] as const;

export type UseLlmsModelId = (typeof USE_LLMS_MODEL_IDS)[number];
export type UseLlmsThinkingLevel = 'low' | 'medium' | 'high' | 'xhigh';
export interface ManagedConversationInitialState {
  messages?: Message[];
  usage?: AgentState['usage'];
}
export type UseLlmsSessionsOption = 'file' | 'memory';
export type UseLlmsMessage = Message;
export type UseLlmsUserMessage = UserMessage;
export type UseLlmsAssistantMessage = BaseAssistantMessage<Api>;
export type UseLlmsAssistantEvent = BaseAssistantEvent<Api>;
export type UseLlmsStream = AssistantMessageEventStream<Api>;
export type UseLlmsConversation = Conversation;
export type UseLlmsSessionManager = SessionManager;

export interface StreamLlmOptions {
  modelId: UseLlmsModelId;
  messages: Message[];
  systemPrompt?: string;
  tools?: Tool[];
  thinkingLevel?: UseLlmsThinkingLevel;
}

export interface CreateManagedConversationOptions {
  modelId: UseLlmsModelId;
  systemPrompt?: string;
  thinkingLevel?: UseLlmsThinkingLevel;
  sessions?: UseLlmsSessionsOption;
  initialState?: ManagedConversationInitialState;
  tools?: AgentTool[];
}

export interface ManagedConversationWithSessions {
  conversation: Conversation;
  sessionManager: SessionManager;
  sessionsAdapter: FileSessionsAdapter | InMemorySessionsAdapter;
}

export interface ManagedConversationWithFileSessions extends ManagedConversationWithSessions {
  sessionsAdapter: FileSessionsAdapter;
}

export interface ManagedConversationWithMemorySessions extends ManagedConversationWithSessions {
  sessionsAdapter: InMemorySessionsAdapter;
}

function resolveUseLlmsModel(modelId: UseLlmsModelId): Model<'codex'> {
  const model = getModel<'codex'>('codex', modelId);
  if (!model) {
    throw new Error(
      `Unsupported use-llms model "${modelId}". Supported models: ${USE_LLMS_MODEL_IDS.join(', ')}.`
    );
  }

  return model;
}

function resolveUseLlmsProvider(
  modelId: UseLlmsModelId,
  thinkingLevel?: UseLlmsThinkingLevel
): Provider<'codex'> {
  const provider: Provider<'codex'> = {
    model: resolveUseLlmsModel(modelId),
  };

  if (thinkingLevel !== undefined) {
    provider.providerOptions = {
      reasoning: {
        effort: thinkingLevel,
        summary: 'auto',
      },
    } as NonNullable<Provider<'codex'>['providerOptions']>;
  }

  return provider;
}

function resolveStreamContext({
  messages,
  systemPrompt,
  tools,
}: Pick<StreamLlmOptions, 'messages' | 'systemPrompt' | 'tools'>): Context {
  return {
    messages,
    ...(systemPrompt !== undefined ? { systemPrompt } : {}),
    ...(tools !== undefined ? { tools } : {}),
  };
}

function resolveSessionsAdapter(
  sessions: Exclude<UseLlmsSessionsOption, undefined>
): FileSessionsAdapter | InMemorySessionsAdapter {
  if (sessions === 'file') {
    return createFileSessionsAdapter();
  }

  return new InMemorySessionsAdapter();
}

function buildConversationInitialState(
  initialState?: ManagedConversationInitialState
): Partial<AgentState> | undefined {
  if (!initialState) {
    return undefined;
  }

  const resolvedInitialState: Partial<AgentState> = {};

  if (initialState.messages !== undefined) {
    resolvedInitialState.messages = initialState.messages;
  }

  if (initialState.usage !== undefined) {
    resolvedInitialState.usage = initialState.usage;
  }

  return resolvedInitialState;
}

export async function streamLlm(options: StreamLlmOptions): Promise<UseLlmsStream> {
  const { modelId, messages, systemPrompt, tools, thinkingLevel } = options;
  const provider = resolveUseLlmsProvider(modelId, thinkingLevel);
  const streamOptions = {
    keysAdapter: defaultKeysAdapter,
    ...(provider.providerOptions !== undefined
      ? { providerOptions: provider.providerOptions }
      : {}),
  };

  return sdkStream(
    provider.model,
    resolveStreamContext({
      messages,
      ...(systemPrompt !== undefined ? { systemPrompt } : {}),
      ...(tools !== undefined ? { tools } : {}),
    }),
    streamOptions
  );
}

 
export function createManagedConversation(
  options: CreateManagedConversationOptions & { sessions?: undefined }
): Conversation;
// eslint-disable-next-line no-redeclare
export function createManagedConversation(
  options: CreateManagedConversationOptions & { sessions: 'file' }
): ManagedConversationWithFileSessions;
// eslint-disable-next-line no-redeclare
export function createManagedConversation(
  options: CreateManagedConversationOptions & { sessions: 'memory' }
): ManagedConversationWithMemorySessions;
// eslint-disable-next-line no-redeclare
export function createManagedConversation(
  options: CreateManagedConversationOptions
): Conversation | ManagedConversationWithSessions {
  const { modelId, systemPrompt, thinkingLevel, sessions, initialState, tools } = options;

  const provider = resolveUseLlmsProvider(modelId, thinkingLevel);
  const resolvedInitialState = buildConversationInitialState(initialState);
  const conversation = new Conversation({
    keysAdapter: defaultKeysAdapter,
    streamAssistantMessage: true,
    ...(resolvedInitialState !== undefined ? { initialState: resolvedInitialState } : {}),
  });

  conversation.setProvider(provider);
  if (systemPrompt !== undefined) {
    conversation.setSystemPrompt(systemPrompt);
  }
  if (tools !== undefined) {
    conversation.setTools(tools);
  }

  if (sessions === undefined) {
    return conversation;
  }

  const sessionsAdapter = resolveSessionsAdapter(sessions);

  return {
    conversation,
    sessionManager: createSessionManager(sessionsAdapter),
    sessionsAdapter,
  };
}
