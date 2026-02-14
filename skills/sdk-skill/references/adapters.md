# Adapters

The SDK uses three adapter interfaces for pluggable storage. Interfaces are defined in `@ank1015/llm-types`, implementations live in `@ank1015/llm-sdk-adapters`.

## Overview

| Interface         | Purpose                      | File Impl             | In-Memory Impl            |
| ----------------- | ---------------------------- | --------------------- | ------------------------- |
| `KeysAdapter`     | API key / credential storage | `FileKeysAdapter`     | `InMemoryKeysAdapter`     |
| `UsageAdapter`    | Token/cost tracking          | `SqliteUsageAdapter`  | `InMemoryUsageAdapter`    |
| `SessionsAdapter` | Conversation persistence     | `FileSessionsAdapter` | `InMemorySessionsAdapter` |

```bash
pnpm add @ank1015/llm-sdk-adapters
```

## KeysAdapter — Credential Storage

### Interface

```ts
interface KeysAdapter {
  get(api: Api): Promise<string | undefined>;
  getCredentials?(api: Api): Promise<Record<string, string> | undefined>;
  set(api: Api, key: string): Promise<void>;
  setCredentials?(api: Api, credentials: Record<string, string>): Promise<void>;
  delete(api: Api): Promise<boolean>;
  deleteCredentials?(api: Api): Promise<boolean>;
  list(): Promise<Api[]>;
}
```

### FileKeysAdapter

Stores keys as AES-256-GCM encrypted files in `~/.llm/global/keys/`.

```ts
import { createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

const keys = createFileKeysAdapter(); // default path
const keys2 = createFileKeysAdapter('/custom'); // custom path

// Single-key providers (most providers)
await keys.set('anthropic', 'sk-ant-...');
const key = await keys.get('anthropic');

// Multi-credential providers (codex, claude-code)
await keys.setCredentials('codex', {
  apiKey: 'token-...',
  'chatgpt-account-id': 'acct-...',
});
const creds = await keys.getCredentials('codex');

// List configured providers
const apis = await keys.list(); // ['anthropic', 'codex', ...]
```

### InMemoryKeysAdapter (for testing)

```ts
import { InMemoryKeysAdapter } from '@ank1015/llm-sdk-adapters';

const keys = new InMemoryKeysAdapter();
await keys.set('anthropic', 'test-key');
```

## UsageAdapter — Token & Cost Tracking

### Interface

```ts
interface UsageAdapter {
  track<TApi extends Api>(message: BaseAssistantMessage<TApi>): Promise<void>;
  getStats(filters?: UsageFilters): Promise<UsageStats>;
  getMessage<TApi extends Api>(id: string): Promise<BaseAssistantMessage<TApi> | undefined>;
  getMessages<TApi extends Api>(filters?: UsageFilters): Promise<BaseAssistantMessage<TApi>[]>;
  deleteMessage(id: string): Promise<boolean>;
}
```

### SqliteUsageAdapter

Stores usage in SQLite (WAL mode) at `~/.llm/global/usages/messages.db`.

```ts
import { createSqliteUsageAdapter } from '@ank1015/llm-sdk-adapters';

const usage = createSqliteUsageAdapter();

// Tracking happens automatically when passed to complete()/stream()/Conversation
// Manual tracking:
await usage.track(assistantMessage);

// Query stats
const stats = await usage.getStats();
console.log(stats.cost.total); // total USD spent
console.log(stats.tokens.total); // total tokens used
console.log(stats.byApi); // breakdown by provider
console.log(stats.byModel); // breakdown by model

// Filtered stats
const recent = await usage.getStats({
  api: 'anthropic',
  startTime: Date.now() - 86400000, // last 24h
});

// Get individual messages
const messages = await usage.getMessages({ limit: 10 });
```

### UsageFilters

```ts
interface UsageFilters {
  api?: Api;
  modelId?: string;
  startTime?: number; // unix ms
  endTime?: number;
  limit?: number;
  offset?: number;
}
```

### UsageStats Shape

```ts
interface UsageStats {
  totalMessages: number;
  tokens: TokenBreakdown; // { input, output, cacheRead, cacheWrite, total }
  cost: CostBreakdown; // { input, output, cacheRead, cacheWrite, total }
  byApi: Record<string, { messages; tokens; cost }>;
  byModel: Record<string, { api; modelName; messages; tokens; cost }>;
}
```

### InMemoryUsageAdapter (for testing)

```ts
import { InMemoryUsageAdapter } from '@ank1015/llm-sdk-adapters';
const usage = new InMemoryUsageAdapter();
```

## SessionsAdapter — Conversation Persistence

See [sessions.md](sessions.md) for full `SessionsAdapter` usage with `SessionManager`.

### FileSessionsAdapter

Stores sessions as JSONL files in `~/.llm/sessions/<project>/<path>/<id>.jsonl`.

```ts
import { createFileSessionsAdapter } from '@ank1015/llm-sdk-adapters';
const sessions = createFileSessionsAdapter();
```

### InMemorySessionsAdapter (for testing)

```ts
import { InMemorySessionsAdapter } from '@ank1015/llm-sdk-adapters';
const sessions = new InMemorySessionsAdapter();
```

## Plugging Adapters Into the SDK

### With complete()/stream()

```ts
const msg = await complete(model, context, {
  keysAdapter: keys, // resolves credentials
  usageAdapter: usage, // tracks after completion
});
```

### With Conversation

```ts
const convo = new Conversation({
  keysAdapter: keys,
  usageAdapter: usage,
});
// Or set later:
convo.setKeysAdapter(keys);
convo.setUsageAdapter(usage);
```
