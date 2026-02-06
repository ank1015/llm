import { ApiKeyNotFoundError, Conversation, getModels } from '@ank1015/llm-sdk';

import type {
  AgentEvent,
  AgentTool,
  Api,
  Attachment,
  ConversationExternalCallback,
  Message,
  MessageNode,
  Model,
  Session,
  SessionLocation,
} from '@ank1015/llm-sdk';
import type { FileSessionsAdapter } from '@ank1015/llm-sdk-adapters';

import { createKeysAdapter, parseApi } from '@/lib/api/keys';
import { createSessionsAdapter, parseSessionScope, toSessionLocation } from '@/lib/api/sessions';
import { extractTool, searchTool } from '@/lib/api/tools';

export type ConversationTurnBody = {
  projectName?: string;
  path?: string;
  branch?: string;
  parentId?: string;
  prompt?: string;
  attachments?: Attachment[];
  api?: Api;
  modelId?: string;
  providerOptions?: Record<string, unknown>;
  systemPrompt?: string;
  useWebSearch?: boolean;
};

type RouteFailure = {
  status: number;
  code: string;
  message: string;
};

export type PreparedConversationTurn = {
  sessionsAdapter: FileSessionsAdapter;
  location: SessionLocation;
  session: Session;
  projectName: string;
  path: string;
  sessionId: string;
  branch: string;
  parentId: string;
  prompt: string;
  attachments?: Attachment[];
  api: Api;
  modelId: string;
  model: Model<Api>;
  providerOptions: Record<string, unknown>;
  systemPrompt?: string;
  useWebSearch: boolean;
};

export type ConversationTurnResult = {
  newMessages: Message[];
  nodes: MessageNode[];
  branch: string;
};

class ApiRouteError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'ApiRouteError';
  }
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isAttachment(value: unknown): value is Attachment {
  if (!isObjectRecord(value)) {
    return false;
  }

  const id = value.id;
  const type = value.type;
  const fileName = value.fileName;
  const mimeType = value.mimeType;
  const content = value.content;
  const size = value.size;

  if (typeof id !== 'string' || id.trim().length === 0) {
    return false;
  }

  if (type !== 'image' && type !== 'file') {
    return false;
  }

  if (
    typeof fileName !== 'string' ||
    fileName.trim().length === 0 ||
    typeof mimeType !== 'string' ||
    mimeType.trim().length === 0 ||
    typeof content !== 'string' ||
    content.trim().length === 0
  ) {
    return false;
  }

  if (size !== undefined && (typeof size !== 'number' || !Number.isFinite(size) || size < 0)) {
    return false;
  }

  return true;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
export function parseConversationTurnBody(value: unknown): ConversationTurnBody | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const body: ConversationTurnBody = {};

  if (value.projectName !== undefined) {
    if (typeof value.projectName !== 'string') {
      return undefined;
    }
    body.projectName = value.projectName;
  }

  if (value.path !== undefined) {
    if (typeof value.path !== 'string') {
      return undefined;
    }
    body.path = value.path;
  }

  if (value.branch !== undefined) {
    if (typeof value.branch !== 'string') {
      return undefined;
    }
    body.branch = value.branch;
  }

  if (value.parentId !== undefined) {
    if (typeof value.parentId !== 'string') {
      return undefined;
    }
    body.parentId = value.parentId;
  }

  if (value.prompt !== undefined) {
    if (typeof value.prompt !== 'string') {
      return undefined;
    }
    body.prompt = value.prompt;
  }

  if (value.api !== undefined) {
    if (typeof value.api !== 'string') {
      return undefined;
    }

    const api = parseApi(value.api);
    if (!api) {
      return undefined;
    }
    body.api = api;
  }

  if (value.modelId !== undefined) {
    if (typeof value.modelId !== 'string') {
      return undefined;
    }
    body.modelId = value.modelId;
  }

  if (value.providerOptions !== undefined) {
    if (!isObjectRecord(value.providerOptions)) {
      return undefined;
    }
    body.providerOptions = value.providerOptions;
  }

  if (value.systemPrompt !== undefined) {
    if (typeof value.systemPrompt !== 'string') {
      return undefined;
    }
    body.systemPrompt = value.systemPrompt;
  }

  if (value.attachments !== undefined) {
    if (
      !Array.isArray(value.attachments) ||
      !value.attachments.every((item) => isAttachment(item))
    ) {
      return undefined;
    }
    body.attachments = value.attachments;
  }

  if (value.useWebSearch !== undefined) {
    if (typeof value.useWebSearch !== 'boolean') {
      return undefined;
    }
    body.useWebSearch = value.useWebSearch;
  }

  return body;
}

function normalizeBranch(value: string | undefined): string {
  const branch = value?.trim();
  return branch && branch.length > 0 ? branch : 'main';
}

function resolveModel(api: Api, modelId: string): Model<Api> | undefined {
  return getModels(api).find((model) => model.id === modelId) as Model<Api> | undefined;
}

function toFailure(error: ApiRouteError): RouteFailure {
  return {
    status: error.status,
    code: error.code,
    message: error.message,
  };
}

export function toConversationFailure(error: unknown): RouteFailure {
  if (error instanceof ApiRouteError) {
    return toFailure(error);
  }

  if (error instanceof ApiKeyNotFoundError) {
    return {
      status: 400,
      code: 'API_KEY_NOT_FOUND',
      message: error.message,
    };
  }

  if (error instanceof Error) {
    return {
      status: 500,
      code: 'CONVERSATION_FAILED',
      message: error.message,
    };
  }

  return {
    status: 500,
    code: 'CONVERSATION_FAILED',
    message: 'Failed to run conversation turn.',
  };
}

export async function prepareConversationTurn(
  sessionId: string,
  body: ConversationTurnBody
): Promise<PreparedConversationTurn> {
  if (!sessionId) {
    throw new ApiRouteError(400, 'INVALID_SESSION_ID', 'Session ID is required.');
  }

  const scope = parseSessionScope({
    projectName: body.projectName,
    path: body.path,
  });
  if (!scope) {
    throw new ApiRouteError(
      400,
      'INVALID_SESSION_SCOPE',
      'Invalid projectName/path. projectName cannot include path separators.'
    );
  }

  const prompt = body.prompt?.trim();
  if (!prompt) {
    throw new ApiRouteError(400, 'MISSING_PROMPT', '"prompt" is required and must be non-empty.');
  }

  if (!body.api || !body.modelId) {
    throw new ApiRouteError(400, 'MISSING_MODEL_CONFIG', '"api" and "modelId" are required.');
  }

  const model = resolveModel(body.api, body.modelId);
  if (!model) {
    throw new ApiRouteError(
      400,
      'MODEL_NOT_FOUND',
      `Model not found for provider ${body.api}: ${body.modelId}`
    );
  }

  const branch = normalizeBranch(body.branch);
  const sessionsAdapter = createSessionsAdapter();
  const location = toSessionLocation(scope, sessionId);

  const session = await sessionsAdapter.getSession(location);
  if (!session) {
    throw new ApiRouteError(404, 'SESSION_NOT_FOUND', `Session not found: ${sessionId}`);
  }

  let parentId = body.parentId?.trim();
  if (!parentId) {
    const latestNode = await sessionsAdapter.getLatestNode(location, branch);
    if (!latestNode) {
      throw new ApiRouteError(
        404,
        'PARENT_NOT_FOUND',
        `No parent node found for branch: ${branch}. Provide "parentId" to start this branch.`
      );
    }
    parentId = latestNode.id;
  }

  const parentNode = await sessionsAdapter.getNode(location, parentId);
  if (!parentNode) {
    throw new ApiRouteError(404, 'PARENT_NOT_FOUND', `Parent node not found: ${parentId}`);
  }

  const systemPrompt = body.systemPrompt?.trim();

  return {
    sessionsAdapter,
    location,
    session,
    projectName: scope.projectName,
    path: scope.path,
    sessionId,
    branch,
    parentId,
    prompt,
    attachments: body.attachments,
    api: body.api,
    modelId: body.modelId,
    model,
    providerOptions: body.providerOptions ?? {},
    systemPrompt: systemPrompt && systemPrompt.length > 0 ? systemPrompt : undefined,
    useWebSearch: body.useWebSearch ?? false,
  };
}

async function getBranchMessages(
  sessionsAdapter: FileSessionsAdapter,
  location: SessionLocation,
  branch: string
): Promise<Message[]> {
  const history = await sessionsAdapter.getBranchHistory(location, branch);
  if (!history) {
    throw new ApiRouteError(404, 'SESSION_NOT_FOUND', `Session not found: ${location.sessionId}`);
  }

  return history
    .filter((node): node is MessageNode => node.type === 'message')
    .map((node) => node.message);
}

function createPersistenceCallback(prepared: PreparedConversationTurn): {
  callback: ConversationExternalCallback;
  nodes: MessageNode[];
} {
  const nodes: MessageNode[] = [];
  let parentId = prepared.parentId;

  const callback: ConversationExternalCallback = async (message) => {
    const result = await prepared.sessionsAdapter.appendMessage({
      projectName: prepared.projectName,
      path: prepared.path,
      sessionId: prepared.sessionId,
      parentId,
      branch: prepared.branch,
      message,
      api: prepared.api,
      modelId: prepared.modelId,
      providerOptions: prepared.providerOptions,
    });

    nodes.push(result.node);
    parentId = result.node.id;
  };

  return {
    callback,
    nodes,
  };
}

export async function runConversationTurn(
  prepared: PreparedConversationTurn,
  options: {
    streamAssistantMessage: boolean;
    onEvent?: (event: AgentEvent) => void;
    requestSignal?: AbortSignal;
  }
): Promise<ConversationTurnResult> {
  const contextMessages = await getBranchMessages(
    prepared.sessionsAdapter,
    prepared.location,
    prepared.branch
  );

  const conversation = new Conversation({
    keysAdapter: createKeysAdapter(),
    streamAssistantMessage: options.streamAssistantMessage,
    initialState: {
      messages: contextMessages,
      // Tools use specific TypeBox schemas that are subtypes of TSchema;
      // the variance mismatch requires a cast to satisfy AgentTool[]
      tools: prepared.useWebSearch ? ([searchTool, extractTool] as unknown as AgentTool[]) : [],
    },
  });

  conversation.setProvider({
    model: prepared.model,
    providerOptions: prepared.providerOptions,
  });

  if (prepared.systemPrompt) {
    conversation.setSystemPrompt(prepared.systemPrompt);
  }

  const unsubscribe = options.onEvent
    ? conversation.subscribe((event) => options.onEvent?.(event))
    : undefined;

  const abortListener: () => void = () => {
    conversation.abort();
  };

  if (options.requestSignal) {
    options.requestSignal.addEventListener('abort', abortListener, { once: true });
  }

  try {
    const persistence = createPersistenceCallback(prepared);
    const newMessages = await conversation.prompt(
      prepared.prompt,
      prepared.attachments,
      persistence.callback
    );

    return {
      newMessages,
      nodes: persistence.nodes,
      branch: prepared.branch,
    };
  } finally {
    unsubscribe?.();
    if (options.requestSignal) {
      options.requestSignal.removeEventListener('abort', abortListener);
    }
  }
}
