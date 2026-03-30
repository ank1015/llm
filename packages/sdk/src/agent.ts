import { randomUUID } from 'node:crypto';

import { agentEngine, createEventAdapter, defaultModelInvoker } from '@ank1015/llm-core';

import { resolveModelInput } from './model-input.js';
import { createSessionPath, createSessionAppender, ensureSession, loadSessionMessages } from './session.js';

import type {
  AgentEngineConfig,
  AgentError,
  AgentEvent,
  AgentRunState,
  AgentTool,
  Api,
  BaseAssistantMessage,
  Message,
} from '@ank1015/llm-core';
import type { ApiForModelId } from './llm.js';
import type {
  CuratedModelId,
  ProviderOptionsForModelId,
  ReasoningEffort,
  ResolveModelInputError,
} from './model-input.js';
import type { SessionAppender, SessionMessagesLoader, SessionNodeSaver } from './session.js';

export const DEFAULT_AGENT_MAX_TURNS = 20;

type SetupFailure = {
  modelId: string;
  keysFilePath: string;
  error: ResolveModelInputError;
};

export type AgentFailurePhase =
  | 'session'
  | 'model'
  | 'tool'
  | 'limit'
  | 'hook'
  | 'aborted';

export interface AgentFailure {
  phase: AgentFailurePhase;
  message: string;
  canRetry: boolean;
}

export interface AgentSessionInput {
  path?: string;
  branch?: string;
  headId?: string;
  title?: string;
  loadMessages?: SessionMessagesLoader;
  saveNode?: SessionNodeSaver;
}

export interface AgentInput<TModelId extends CuratedModelId = CuratedModelId> {
  modelId: TModelId;
  inputMessages?: Message[];
  system?: string;
  tools?: AgentTool[];
  session?: AgentSessionInput;
  reasoningEffort?: ReasoningEffort;
  overrideProviderSetting?: Partial<ProviderOptionsForModelId<TModelId>>;
  keysFilePath?: string;
  signal?: AbortSignal;
  maxTurns?: number;
}

export interface AgentSuccessResult<TApi extends Api = Api> {
  ok: true;
  sessionPath: string;
  sessionId: string;
  branch: string;
  headId: string;
  messages: Message[];
  newMessages: Message[];
  finalAssistantMessage?: BaseAssistantMessage<TApi>;
  turns: number;
  totalTokens: number;
  totalCost: number;
}

export interface AgentFailureResult {
  ok: false;
  sessionPath: string;
  sessionId: string;
  branch: string;
  headId?: string;
  messages: Message[];
  newMessages: Message[];
  error: AgentFailure;
  turns: number;
  totalTokens: number;
  totalCost: number;
}

export type AgentResult<TApi extends Api = Api> = AgentSuccessResult<TApi> | AgentFailureResult;

export interface AgentRun<TApi extends Api = Api>
  extends AsyncIterable<AgentEvent>,
    PromiseLike<AgentResult<TApi>> {
  readonly sessionPath: string;
  drain(): Promise<AgentResult<TApi>>;
  catch<TResult = never>(
    onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<AgentResult<TApi> | TResult>;
  finally(onFinally?: (() => void) | null): Promise<AgentResult<TApi>>;
}

type RunConsumptionState = 'none' | 'active' | 'closed' | 'completed';

type AgentSessionState = {
  sessionPath: string;
  sessionId: string;
  branch: string;
  headId: string;
  historyMessages: Message[];
  appender: SessionAppender;
};

export class AgentRunConsumptionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AgentRunConsumptionError';
  }
}

export class AgentInputError extends Error {
  readonly code: ResolveModelInputError['code'];
  readonly details: ResolveModelInputError;
  readonly modelId: string;
  readonly keysFilePath: string;

  constructor(failure: SetupFailure) {
    super(failure.error.message);
    this.name = 'AgentInputError';
    this.code = failure.error.code;
    this.details = failure.error;
    this.modelId = failure.modelId;
    this.keysFilePath = failure.keysFilePath;
  }
}

class AgentEventRun<TApi extends Api> implements AgentRun<TApi> {
  private queue: AgentEvent[] = [];
  private waiting: Array<(value: IteratorResult<AgentEvent>) => void> = [];
  private done = false;
  private readonly resultPromise: Promise<AgentResult<TApi>>;
  private resolveResult!: (result: AgentResult<TApi>) => void;
  private rejectResult!: (error: unknown) => void;
  private consumptionState: RunConsumptionState = 'none';
  private drainPromise: Promise<AgentResult<TApi>> | undefined;
  readonly sessionPath: string;

  constructor(sessionPath: string) {
    this.sessionPath = sessionPath;
    this.resultPromise = new Promise<AgentResult<TApi>>((resolve, reject) => {
      this.resolveResult = resolve;
      this.rejectResult = reject;
    });
  }

  push(event: AgentEvent): void {
    if (this.done) {
      return;
    }

    const waiter = this.waiting.shift();
    if (waiter) {
      waiter({ value: event, done: false });
      return;
    }

    this.queue.push(event);
  }

  end(result: AgentResult<TApi>): void {
    if (this.done) {
      return;
    }

    this.done = true;
    this.resolveResult(result);

    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      waiter({ done: true, value: undefined! });
    }
  }

  fail(error: unknown): void {
    if (this.done) {
      return;
    }

    this.done = true;
    this.rejectResult(error);

    while (this.waiting.length > 0) {
      const waiter = this.waiting.shift()!;
      waiter({ done: true, value: undefined! });
    }
  }

  async *[Symbol.asyncIterator](): AsyncIterator<AgentEvent> {
    if (this.drainPromise) {
      throw new AgentRunConsumptionError(
        'Cannot iterate an AgentRun after await()/then()/catch()/finally()/drain() consumption has started. Use either await/drain, or iterate first and await after the loop finishes.'
      );
    }

    if (this.consumptionState !== 'none') {
      throw new AgentRunConsumptionError(
        'AgentRun only supports a single async iterator consumer.'
      );
    }

    this.consumptionState = 'active';

    try {
      while (true) {
        const result = await this.takeNextEvent();

        if (result.done) {
          this.consumptionState = 'completed';
          return;
        }

        yield result.value;
      }
    } finally {
      if (this.consumptionState === 'active') {
        this.consumptionState = this.done ? 'completed' : 'closed';
      }
    }
  }

  async drain(): Promise<AgentResult<TApi>> {
    if (this.consumptionState === 'active') {
      throw new AgentRunConsumptionError(
        'Cannot await or drain an AgentRun while its async iterator is still being consumed. Finish the for await loop first, or do not iterate and just await/drain the run.'
      );
    }

    if (this.consumptionState === 'completed') {
      return this.resultPromise;
    }

    if (!this.drainPromise) {
      this.drainPromise = this.discardRemainingEvents();
    }

    return this.drainPromise;
  }

  then<TResult1 = AgentResult<TApi>, TResult2 = never>(
    onFulfilled?: ((value: AgentResult<TApi>) => TResult1 | PromiseLike<TResult1>) | null,
    onRejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null
  ): Promise<TResult1 | TResult2> {
    return this.drain().then(onFulfilled, onRejected);
  }

  catch<TResult = never>(
    onRejected?: ((reason: unknown) => TResult | PromiseLike<TResult>) | null
  ): Promise<AgentResult<TApi> | TResult> {
    return this.drain().catch(onRejected);
  }

  finally(onFinally?: (() => void) | null): Promise<AgentResult<TApi>> {
    return this.drain().finally(onFinally);
  }

  private async takeNextEvent(): Promise<IteratorResult<AgentEvent>> {
    if (this.queue.length > 0) {
      return {
        value: this.queue.shift()!,
        done: false,
      };
    }

    if (this.done) {
      return {
        done: true,
        value: undefined!,
      };
    }

    return new Promise<IteratorResult<AgentEvent>>((resolve) => {
      this.waiting.push(resolve);
    });
  }

  private async discardRemainingEvents(): Promise<AgentResult<TApi>> {
    while (true) {
      const result = await this.takeNextEvent();
      if (result.done) {
        return this.resultPromise;
      }
    }
  }
}

export function agent<TModelId extends CuratedModelId>(
  input: AgentInput<TModelId>
): AgentRun<ApiForModelId<TModelId>> {
  const sessionPath = input.session?.path ?? createSessionPath();
  const run = new AgentEventRun<ApiForModelId<TModelId>>(sessionPath);
  void executeAgent(input, run, sessionPath);
  return run;
}

async function executeAgent<TModelId extends CuratedModelId>(
  input: AgentInput<TModelId>,
  run: AgentEventRun<ApiForModelId<TModelId>>,
  sessionPath: string
): Promise<void> {
  const provisionalSessionId = randomUUID();
  const requestedBranch = input.session?.branch ?? 'main';

  let sessionId: string = provisionalSessionId;
  let headId: string | undefined;
  let branch = requestedBranch;
  let messages: Message[] = [];
  let newMessages: Message[] = [];
  let turns = 0;
  let totalTokens = 0;
  let totalCost = 0;

  try {
    const sessionState = await resolveAgentSession(input, {
      sessionPath,
      provisionalSessionId,
      requestedBranch,
    });

    sessionId = sessionState.sessionId;
    branch = sessionState.branch;
    headId = sessionState.headId;
    messages = [...sessionState.historyMessages];

    if (input.signal?.aborted) {
      run.end(
        createFailureResult<ApiForModelId<TModelId>>({
          sessionPath,
          sessionId,
          branch,
          headId,
          messages,
          newMessages,
          error: {
            phase: 'aborted',
            message: 'Agent run was aborted before execution started.',
            canRetry: true,
          },
          turns,
          totalTokens,
          totalCost,
        })
      );
      return;
    }

    const resolved = await resolveModelInput({
      modelId: input.modelId,
      ...(input.reasoningEffort !== undefined ? { reasoningEffort: input.reasoningEffort } : {}),
      ...(input.overrideProviderSetting !== undefined
        ? { overrideProviderSetting: input.overrideProviderSetting }
        : {}),
      ...(input.keysFilePath !== undefined ? { keysFilePath: input.keysFilePath } : {}),
    });

    if (!resolved.ok) {
      run.fail(new AgentInputError(resolved));
      return;
    }

    const adapter = createEventAdapter(agentEngine, {
      onEvent: async (event) => {
        run.push(event);
      },
    });

    const sessionAppender = sessionState.appender;
    let persistenceFailure: AgentFailure | undefined;
    let persistenceQueue = Promise.resolve();

    const queuePersistence = (message: Message): Promise<void> => {
      persistenceQueue = persistenceQueue.then(async () => {
        if (persistenceFailure) {
          return;
        }

        try {
          const appended = await sessionAppender.appendMessage({
            message,
            branch,
          });
          headId = appended.node.id;
        } catch (error) {
          persistenceFailure = {
            phase: 'session',
            message: getErrorMessage(error),
            canRetry: false,
          };
        }
      });

      return persistenceQueue;
    };

    const config: AgentEngineConfig = {
      provider: resolved.provider,
      modelInvoker: defaultModelInvoker,
      tools: input.tools ?? [],
      limits: {
        maxTurns: input.maxTurns ?? DEFAULT_AGENT_MAX_TURNS,
      },
      ...(input.system !== undefined ? { systemPrompt: input.system } : {}),
    };

    const initialState: AgentRunState = {
      messages: [...sessionState.historyMessages],
      totalCost: 0,
      totalTokens: 0,
      turns: 0,
    };

    const coreResult = await adapter.run(config, initialState, {
      ...(input.signal !== undefined ? { signal: input.signal } : {}),
      onMessage: queuePersistence,
    });

    await persistenceQueue;
    headId = sessionAppender.headId;

    newMessages = [...coreResult.newMessages];
    messages = [...sessionState.historyMessages, ...newMessages];
    turns = coreResult.state.turns;
    totalTokens = coreResult.state.totalTokens;
    totalCost = coreResult.state.totalCost;

    if (persistenceFailure) {
      run.end(
        createFailureResult<ApiForModelId<TModelId>>({
          sessionPath,
          sessionId,
          branch,
          headId,
          messages,
          newMessages,
          error: persistenceFailure,
          turns,
          totalTokens,
          totalCost,
        })
      );
      return;
    }

    if (coreResult.aborted) {
      run.end(
        createFailureResult<ApiForModelId<TModelId>>({
          sessionPath,
          sessionId,
          branch,
          headId,
          messages,
          newMessages,
          error: {
            phase: 'aborted',
            message: 'Agent run was aborted.',
            canRetry: true,
          },
          turns,
          totalTokens,
          totalCost,
        })
      );
      return;
    }

    if (coreResult.error) {
      run.end(
        createFailureResult<ApiForModelId<TModelId>>({
          sessionPath,
          sessionId,
          branch,
          headId,
          messages,
          newMessages,
          error: fromCoreAgentError(coreResult.error),
          turns,
          totalTokens,
          totalCost,
        })
      );
      return;
    }

    const finalAssistantMessage = findLastAssistantMessage<ApiForModelId<TModelId>>(newMessages);

    run.end({
      ok: true,
      sessionPath,
      sessionId,
      branch,
      headId: headId ?? sessionId,
      messages,
      newMessages,
      ...(finalAssistantMessage !== undefined ? { finalAssistantMessage } : {}),
      turns,
      totalTokens,
      totalCost,
    });
  } catch (error) {
    run.end(
      createFailureResult<ApiForModelId<TModelId>>({
        sessionPath,
        sessionId,
        branch,
        ...(headId !== undefined ? { headId } : {}),
        messages,
        newMessages,
        error: normalizeTopLevelFailure(error, input.signal),
        turns,
        totalTokens,
        totalCost,
      })
    );
  }
}

async function resolveAgentSession(
  input: AgentInput,
  state: {
    sessionPath: string;
    provisionalSessionId: string;
    requestedBranch: string;
  }
): Promise<AgentSessionState> {
  const session = await ensureSession({
    path: state.sessionPath,
    id: state.provisionalSessionId,
    ...(input.session?.title !== undefined ? { title: input.session.title } : {}),
  });

  const loaded = await loadSessionMessages({
    path: session.path,
    branch: state.requestedBranch,
    ...(input.session?.headId !== undefined ? { headId: input.session.headId } : {}),
    ...(input.session?.loadMessages !== undefined ? { messagesLoader: input.session.loadMessages } : {}),
  });

  if (!loaded) {
    throw new Error(`Failed to load session messages from ${session.path}`);
  }

  const appender = await createSessionAppender({
    path: session.path,
    branch: loaded.branch,
    headId: loaded.head.id,
    ...(input.session?.saveNode !== undefined ? { saveNode: input.session.saveNode } : {}),
  });

  const historyMessages = [...loaded.messages];
  const inputMessages = input.inputMessages ?? [];

  for (const message of inputMessages) {
    await appender.appendMessage({
      message,
      branch: loaded.branch,
    });
    historyMessages.push(message);
  }

  return {
    sessionPath: session.path,
    sessionId: session.header.id,
    branch: loaded.branch,
    headId: appender.headId,
    historyMessages,
    appender,
  };
}

function findLastAssistantMessage<TApi extends Api>(
  messages: Message[]
): BaseAssistantMessage<TApi> | undefined {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (message?.role === 'assistant') {
      return message as BaseAssistantMessage<TApi>;
    }
  }

  return undefined;
}

function fromCoreAgentError(error: AgentError): AgentFailure {
  return {
    phase: error.phase,
    message: error.message,
    canRetry: error.canRetry,
  };
}

function createFailureResult<TApi extends Api>(
  input: Omit<AgentFailureResult, 'ok'> & { error: AgentFailure }
): AgentFailureResult {
  return {
    ok: false,
    sessionPath: input.sessionPath,
    sessionId: input.sessionId,
    branch: input.branch,
    ...(input.headId !== undefined ? { headId: input.headId } : {}),
    messages: input.messages,
    newMessages: input.newMessages,
    error: input.error,
    turns: input.turns,
    totalTokens: input.totalTokens,
    totalCost: input.totalCost,
  };
}

function normalizeTopLevelFailure(
  error: unknown,
  signal: AbortSignal | undefined
): AgentFailure {
  if (isAbortLike(error, signal)) {
    return {
      phase: 'aborted',
      message: 'Agent run was aborted.',
      canRetry: true,
    };
  }

  return {
    phase: 'session',
    message: getErrorMessage(error),
    canRetry: false,
  };
}

function isAbortLike(error: unknown, signal: AbortSignal | undefined): boolean {
  if (signal?.aborted) {
    return true;
  }

  return error instanceof Error && (error.name === 'AbortError' || error.name === 'APIUserAbortError');
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error) ?? String(error);
  } catch {
    return String(error);
  }
}
