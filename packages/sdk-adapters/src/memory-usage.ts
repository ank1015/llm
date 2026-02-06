/**
 * In-memory Usage Adapter
 *
 * Simple array-based implementation for testing. No persistence.
 */

import type {
  UsageAdapter,
  UsageFilters,
  UsageStats,
  Api,
  BaseAssistantMessage,
} from '@ank1015/llm-types';

/**
 * In-memory implementation of UsageAdapter for testing.
 */
export class InMemoryUsageAdapter implements UsageAdapter {
  private messages: BaseAssistantMessage<Api>[] = [];

  async track<TApi extends Api>(message: BaseAssistantMessage<TApi>): Promise<void> {
    // Replace if same ID exists, otherwise push
    const index = this.messages.findIndex((m) => m.id === message.id);
    if (index >= 0) {
      this.messages[index] = message;
    } else {
      this.messages.push(message);
    }
  }

  async getMessage<TApi extends Api>(id: string): Promise<BaseAssistantMessage<TApi> | undefined> {
    return this.messages.find((m) => m.id === id) as BaseAssistantMessage<TApi> | undefined;
  }

  async getMessages<TApi extends Api>(
    filters?: UsageFilters
  ): Promise<BaseAssistantMessage<TApi>[]> {
    let result = [...this.messages] as BaseAssistantMessage<TApi>[];

    if (filters?.api) {
      result = result.filter((m) => m.api === filters.api);
    }
    if (filters?.modelId) {
      result = result.filter((m) => m.model.id === filters.modelId);
    }
    if (filters?.startTime) {
      result = result.filter((m) => m.timestamp >= filters.startTime!);
    }
    if (filters?.endTime) {
      result = result.filter((m) => m.timestamp <= filters.endTime!);
    }

    result.sort((a, b) => b.timestamp - a.timestamp);

    if (filters?.offset) {
      result = result.slice(filters.offset);
    }
    if (filters?.limit) {
      result = result.slice(0, filters.limit);
    }

    return result;
  }

  async deleteMessage(id: string): Promise<boolean> {
    const index = this.messages.findIndex((m) => m.id === id);
    if (index < 0) return false;
    this.messages.splice(index, 1);
    return true;
  }

  async getStats(filters?: UsageFilters): Promise<UsageStats> {
    const filtered = await this.getMessages(filters);

    const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
    const cost = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 };
    const byApi: UsageStats['byApi'] = {};
    const byModel: UsageStats['byModel'] = {};

    for (const msg of filtered) {
      tokens.input += msg.usage.input;
      tokens.output += msg.usage.output;
      tokens.cacheRead += msg.usage.cacheRead;
      tokens.cacheWrite += msg.usage.cacheWrite;
      tokens.total += msg.usage.totalTokens;

      cost.input += msg.usage.cost.input;
      cost.output += msg.usage.cost.output;
      cost.cacheRead += msg.usage.cost.cacheRead;
      cost.cacheWrite += msg.usage.cost.cacheWrite;
      cost.total += msg.usage.cost.total;

      // By API
      if (!byApi[msg.api]) {
        byApi[msg.api] = {
          messages: 0,
          tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        };
      }
      const apiEntry = byApi[msg.api]!;
      apiEntry.messages++;
      apiEntry.tokens.input += msg.usage.input;
      apiEntry.tokens.output += msg.usage.output;
      apiEntry.tokens.cacheRead += msg.usage.cacheRead;
      apiEntry.tokens.cacheWrite += msg.usage.cacheWrite;
      apiEntry.tokens.total += msg.usage.totalTokens;
      apiEntry.cost.input += msg.usage.cost.input;
      apiEntry.cost.output += msg.usage.cost.output;
      apiEntry.cost.cacheRead += msg.usage.cost.cacheRead;
      apiEntry.cost.cacheWrite += msg.usage.cost.cacheWrite;
      apiEntry.cost.total += msg.usage.cost.total;

      // By Model
      if (!byModel[msg.model.id]) {
        byModel[msg.model.id] = {
          api: msg.api,
          modelName: msg.model.name,
          messages: 0,
          tokens: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        };
      }
      const modelEntry = byModel[msg.model.id]!;
      modelEntry.messages++;
      modelEntry.tokens.input += msg.usage.input;
      modelEntry.tokens.output += msg.usage.output;
      modelEntry.tokens.cacheRead += msg.usage.cacheRead;
      modelEntry.tokens.cacheWrite += msg.usage.cacheWrite;
      modelEntry.tokens.total += msg.usage.totalTokens;
      modelEntry.cost.input += msg.usage.cost.input;
      modelEntry.cost.output += msg.usage.cost.output;
      modelEntry.cost.cacheRead += msg.usage.cost.cacheRead;
      modelEntry.cost.cacheWrite += msg.usage.cost.cacheWrite;
      modelEntry.cost.total += msg.usage.cost.total;
    }

    return {
      totalMessages: filtered.length,
      tokens,
      cost,
      byApi,
      byModel,
    };
  }
}
