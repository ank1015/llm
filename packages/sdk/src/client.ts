/**
 * LLMClient — central entry point for the SDK.
 *
 * Holds adapters, configuration, and provides factory methods.
 * Eliminates the pattern of passing adapters to every function call.
 */

import { complete as coreComplete, stream as coreStream } from '@ank1015/llm-core';

import { Conversation } from './agent/conversation.js';
import { resolveApiKey } from './utils/resolve-key.js';

import type { KeysAdapter, UsageAdapter, SessionsAdapter } from './adapters/types.js';
import type { ConversationOptions } from './agent/conversation.js';
import type { AssistantMessageEventStream } from '@ank1015/llm-core';
import type {
  Api,
  BaseAssistantMessage,
  Context,
  Model,
  OptionsForApi,
  Provider,
  Session,
  SessionSummary,
} from '@ank1015/llm-types';

export interface LLMClientConfig {
  /** Adapter for retrieving API keys */
  keys?: KeysAdapter;
  /** Adapter for tracking usage */
  usage?: UsageAdapter;
  /** Adapter for session persistence */
  sessions?: SessionsAdapter;
  /** Default provider for conversations */
  defaultProvider?: Provider<Api>;
  /** Usage tracking failure policy (default: 'bestEffort') */
  usageTrackingMode?: 'strict' | 'bestEffort';
}

export class LLMClient {
  readonly keys: KeysAdapter | undefined;
  readonly usage: UsageAdapter | undefined;
  readonly sessions: SessionsAdapter | undefined;
  readonly defaultProvider: Provider<Api> | undefined;
  readonly usageTrackingMode: 'strict' | 'bestEffort';

  constructor(config: LLMClientConfig = {}) {
    this.keys = config.keys;
    this.usage = config.usage;
    this.sessions = config.sessions;
    this.defaultProvider = config.defaultProvider;
    this.usageTrackingMode = config.usageTrackingMode ?? 'bestEffort';
  }

  /**
   * Complete a chat request with auto-wired adapters.
   */
  async complete<TApi extends Api>(
    model: Model<TApi>,
    context: Context,
    providerOptions?: Partial<OptionsForApi<TApi>>
  ): Promise<BaseAssistantMessage<TApi>> {
    const apiKey = await resolveApiKey(
      model.api,
      providerOptions as Record<string, unknown> | undefined,
      this.keys
    );
    const finalOptions = { ...providerOptions, apiKey } as OptionsForApi<TApi>;
    const requestId = `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const message = await coreComplete(model, context, finalOptions, requestId);
    await this.trackUsage(message);
    return message;
  }

  /**
   * Stream a chat request with auto-wired adapters.
   */
  async stream<TApi extends Api>(
    model: Model<TApi>,
    context: Context,
    providerOptions?: Partial<OptionsForApi<TApi>>
  ): Promise<AssistantMessageEventStream<TApi>> {
    const apiKey = await resolveApiKey(
      model.api,
      providerOptions as Record<string, unknown> | undefined,
      this.keys
    );
    const finalOptions = { ...providerOptions, apiKey } as OptionsForApi<TApi>;
    const requestId = `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    const eventStream = coreStream(model, context, finalOptions, requestId);
    return this.wrapStreamWithTracking(eventStream);
  }

  /**
   * Create a Conversation with adapters auto-wired from this client.
   */
  createConversation(
    opts: Omit<ConversationOptions, 'keysAdapter' | 'usageAdapter' | 'sessionsAdapter'> & {
      keysAdapter?: KeysAdapter;
      usageAdapter?: UsageAdapter;
      sessionsAdapter?: SessionsAdapter;
    } = {}
  ): Conversation {
    const convOpts: ConversationOptions = { ...opts };
    const keys = opts.keysAdapter ?? this.keys;
    const usage = opts.usageAdapter ?? this.usage;
    const sessions = opts.sessionsAdapter ?? this.sessions;
    if (keys) convOpts.keysAdapter = keys;
    if (usage) convOpts.usageAdapter = usage;
    if (sessions) convOpts.sessionsAdapter = sessions;
    return new Conversation(convOpts);
  }

  // ── Session query methods (delegate to sessions adapter) ──

  async listSessions(projectName: string, path?: string): Promise<SessionSummary[]> {
    if (!this.sessions) throw new Error('No sessions adapter configured');
    return this.sessions.listSessions(projectName, path);
  }

  async getSession(
    projectName: string,
    sessionId: string,
    path?: string
  ): Promise<Session | undefined> {
    if (!this.sessions) throw new Error('No sessions adapter configured');
    return this.sessions.getSession({ projectName, sessionId, path: path ?? '' });
  }

  async searchSessions(
    projectName: string,
    query: string,
    path?: string
  ): Promise<SessionSummary[]> {
    if (!this.sessions) throw new Error('No sessions adapter configured');
    return this.sessions.searchSessions(projectName, query, path);
  }

  async listProjects(): Promise<string[]> {
    if (!this.sessions) throw new Error('No sessions adapter configured');
    return this.sessions.listProjects();
  }

  // ── Internal ──

  private async trackUsage(message: BaseAssistantMessage<Api>): Promise<void> {
    if (!this.usage) return;
    try {
      await this.usage.track(message);
    } catch (e) {
      if (this.usageTrackingMode === 'strict') throw e;
      // bestEffort: swallow
    }
  }

  private wrapStreamWithTracking<TApi extends Api>(
    eventStream: AssistantMessageEventStream<TApi>
  ): AssistantMessageEventStream<TApi> {
    if (!this.usage) return eventStream;
    const originalResult = eventStream.result.bind(eventStream);
    const tracker = this.usage;
    const mode = this.usageTrackingMode;
    return Object.create(eventStream, {
      result: {
        value: async () => {
          const message = await originalResult();
          try {
            await tracker.track(message);
          } catch (e) {
            if (mode === 'strict') throw e;
          }
          return message;
        },
      },
    }) as AssistantMessageEventStream<TApi>;
  }
}
