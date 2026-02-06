/**
 * SQLite-based Usage Adapter
 *
 * Stores LLM usage data in ~/.llm/global/usages/messages.db
 */

import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import type {
  UsageAdapter,
  UsageFilters,
  UsageStats,
  Api,
  BaseAssistantMessage,
} from '@ank1015/llm-types';

/** Default directory for storing database */
const DEFAULT_USAGES_DIR = join(homedir(), '.llm', 'global', 'usages');

/** Default database file name */
const DEFAULT_DB_NAME = 'messages.db';

/**
 * Database row type for messages
 */
interface MessageRow {
  id: string;
  api: string;
  model_id: string;
  model_name: string;
  timestamp: number;
  duration: number;
  stop_reason: string;
  error_message: string | null;
  input_tokens: number;
  output_tokens: number;
  cache_read_tokens: number;
  cache_write_tokens: number;
  total_tokens: number;
  cost_input: number;
  cost_output: number;
  cost_cache_read: number;
  cost_cache_write: number;
  cost_total: number;
  content_json: string;
  native_message_json: string;
  created_at: number;
}

/**
 * Convert a database row to a BaseAssistantMessage
 */
function rowToMessage<TApi extends Api>(row: MessageRow): BaseAssistantMessage<TApi> {
  const message: BaseAssistantMessage<TApi> = {
    role: 'assistant',
    id: row.id,
    api: row.api as TApi,
    model: {
      id: row.model_id,
      name: row.model_name,
      api: row.api as TApi,
      // These fields are not stored, provide defaults
      baseUrl: '',
      reasoning: false,
      input: [],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 0,
      maxTokens: 0,
      tools: [],
    },
    message: JSON.parse(row.native_message_json),
    timestamp: row.timestamp,
    duration: row.duration,
    stopReason: row.stop_reason as BaseAssistantMessage<TApi>['stopReason'],
    content: JSON.parse(row.content_json),
    usage: {
      input: row.input_tokens,
      output: row.output_tokens,
      cacheRead: row.cache_read_tokens,
      cacheWrite: row.cache_write_tokens,
      totalTokens: row.total_tokens,
      cost: {
        input: row.cost_input,
        output: row.cost_output,
        cacheRead: row.cost_cache_read,
        cacheWrite: row.cost_cache_write,
        total: row.cost_total,
      },
    },
  };

  // Only set errorMessage if it exists
  if (row.error_message !== null) {
    message.errorMessage = row.error_message;
  }

  return message;
}

/**
 * SQLite-based implementation of UsageAdapter.
 */
export class SqliteUsageAdapter implements UsageAdapter {
  private db: Database.Database | null = null;
  private dbPath: string;

  constructor(dbPath?: string) {
    const usagesDir = DEFAULT_USAGES_DIR;
    this.dbPath = dbPath ?? join(usagesDir, DEFAULT_DB_NAME);

    // Ensure directory exists
    const dir = this.dbPath.substring(0, this.dbPath.lastIndexOf('/'));
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
  }

  /**
   * Initialize the database connection.
   */
  private getDb(): Database.Database {
    if (this.db) return this.db;

    this.db = new Database(this.dbPath);

    // Enable WAL mode for better concurrent access
    this.db.pragma('journal_mode = WAL');

    // Create messages table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS messages (
        id TEXT PRIMARY KEY,
        api TEXT NOT NULL,
        model_id TEXT NOT NULL,
        model_name TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        duration INTEGER NOT NULL,
        stop_reason TEXT NOT NULL,
        error_message TEXT,
        input_tokens INTEGER NOT NULL,
        output_tokens INTEGER NOT NULL,
        cache_read_tokens INTEGER NOT NULL,
        cache_write_tokens INTEGER NOT NULL,
        total_tokens INTEGER NOT NULL,
        cost_input REAL NOT NULL,
        cost_output REAL NOT NULL,
        cost_cache_read REAL NOT NULL,
        cost_cache_write REAL NOT NULL,
        cost_total REAL NOT NULL,
        content_json TEXT NOT NULL,
        native_message_json TEXT NOT NULL,
        created_at INTEGER DEFAULT (strftime('%s', 'now'))
      )
    `);

    // Create indexes for common queries
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_messages_api ON messages(api);
      CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
      CREATE INDEX IF NOT EXISTS idx_messages_model_id ON messages(model_id);
    `);

    return this.db;
  }

  async track<TApi extends Api>(message: BaseAssistantMessage<TApi>): Promise<void> {
    const db = this.getDb();

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO messages (
        id, api, model_id, model_name, timestamp, duration, stop_reason, error_message,
        input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens,
        cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total,
        content_json, native_message_json
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?, ?, ?, ?,
        ?, ?
      )
    `);

    stmt.run(
      message.id,
      message.api,
      message.model.id,
      message.model.name,
      message.timestamp,
      message.duration,
      message.stopReason,
      message.errorMessage ?? null,
      message.usage.input,
      message.usage.output,
      message.usage.cacheRead,
      message.usage.cacheWrite,
      message.usage.totalTokens,
      message.usage.cost.input,
      message.usage.cost.output,
      message.usage.cost.cacheRead,
      message.usage.cost.cacheWrite,
      message.usage.cost.total,
      JSON.stringify(message.content),
      JSON.stringify(message.message)
    );
  }

  async getMessage<TApi extends Api>(id: string): Promise<BaseAssistantMessage<TApi> | undefined> {
    const db = this.getDb();
    const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
    const row = stmt.get(id) as MessageRow | undefined;

    if (!row) return undefined;
    return rowToMessage<TApi>(row);
  }

  async getMessages<TApi extends Api>(
    filters?: UsageFilters
  ): Promise<BaseAssistantMessage<TApi>[]> {
    const db = this.getDb();

    let query = 'SELECT * FROM messages WHERE 1=1';
    const params: (string | number)[] = [];

    if (filters?.api) {
      query += ' AND api = ?';
      params.push(filters.api);
    }

    if (filters?.modelId) {
      query += ' AND model_id = ?';
      params.push(filters.modelId);
    }

    if (filters?.startTime) {
      query += ' AND timestamp >= ?';
      params.push(filters.startTime);
    }

    if (filters?.endTime) {
      query += ' AND timestamp <= ?';
      params.push(filters.endTime);
    }

    query += ' ORDER BY timestamp DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as MessageRow[];

    return rows.map((row) => rowToMessage<TApi>(row));
  }

  async deleteMessage(id: string): Promise<boolean> {
    const db = this.getDb();
    const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  }

  async getStats(filters?: UsageFilters): Promise<UsageStats> {
    const db = this.getDb();

    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (filters?.api) {
      whereClause += ' AND api = ?';
      params.push(filters.api);
    }

    if (filters?.modelId) {
      whereClause += ' AND model_id = ?';
      params.push(filters.modelId);
    }

    if (filters?.startTime) {
      whereClause += ' AND timestamp >= ?';
      params.push(filters.startTime);
    }

    if (filters?.endTime) {
      whereClause += ' AND timestamp <= ?';
      params.push(filters.endTime);
    }

    // Get totals
    const totalsStmt = db.prepare(`
      SELECT
        COUNT(*) as total_messages,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(cost_input), 0) as cost_input,
        COALESCE(SUM(cost_output), 0) as cost_output,
        COALESCE(SUM(cost_cache_read), 0) as cost_cache_read,
        COALESCE(SUM(cost_cache_write), 0) as cost_cache_write,
        COALESCE(SUM(cost_total), 0) as cost_total
      FROM messages ${whereClause}
    `);
    const totals = totalsStmt.get(...params) as {
      total_messages: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      total_tokens: number;
      cost_input: number;
      cost_output: number;
      cost_cache_read: number;
      cost_cache_write: number;
      cost_total: number;
    };

    // Get by API
    const byApiStmt = db.prepare(`
      SELECT
        api,
        COUNT(*) as messages,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(cost_input), 0) as cost_input,
        COALESCE(SUM(cost_output), 0) as cost_output,
        COALESCE(SUM(cost_cache_read), 0) as cost_cache_read,
        COALESCE(SUM(cost_cache_write), 0) as cost_cache_write,
        COALESCE(SUM(cost_total), 0) as cost_total
      FROM messages ${whereClause}
      GROUP BY api
    `);
    const byApiRows = byApiStmt.all(...params) as {
      api: string;
      messages: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      total_tokens: number;
      cost_input: number;
      cost_output: number;
      cost_cache_read: number;
      cost_cache_write: number;
      cost_total: number;
    }[];

    const byApi: UsageStats['byApi'] = {};
    for (const row of byApiRows) {
      byApi[row.api] = {
        messages: row.messages,
        tokens: {
          input: row.input_tokens,
          output: row.output_tokens,
          cacheRead: row.cache_read_tokens,
          cacheWrite: row.cache_write_tokens,
          total: row.total_tokens,
        },
        cost: {
          input: row.cost_input,
          output: row.cost_output,
          cacheRead: row.cost_cache_read,
          cacheWrite: row.cost_cache_write,
          total: row.cost_total,
        },
      };
    }

    // Get by Model
    const byModelStmt = db.prepare(`
      SELECT
        model_id,
        api,
        model_name,
        COUNT(*) as messages,
        COALESCE(SUM(input_tokens), 0) as input_tokens,
        COALESCE(SUM(output_tokens), 0) as output_tokens,
        COALESCE(SUM(cache_read_tokens), 0) as cache_read_tokens,
        COALESCE(SUM(cache_write_tokens), 0) as cache_write_tokens,
        COALESCE(SUM(total_tokens), 0) as total_tokens,
        COALESCE(SUM(cost_input), 0) as cost_input,
        COALESCE(SUM(cost_output), 0) as cost_output,
        COALESCE(SUM(cost_cache_read), 0) as cost_cache_read,
        COALESCE(SUM(cost_cache_write), 0) as cost_cache_write,
        COALESCE(SUM(cost_total), 0) as cost_total
      FROM messages ${whereClause}
      GROUP BY model_id
    `);
    const byModelRows = byModelStmt.all(...params) as {
      model_id: string;
      api: string;
      model_name: string;
      messages: number;
      input_tokens: number;
      output_tokens: number;
      cache_read_tokens: number;
      cache_write_tokens: number;
      total_tokens: number;
      cost_input: number;
      cost_output: number;
      cost_cache_read: number;
      cost_cache_write: number;
      cost_total: number;
    }[];

    const byModel: UsageStats['byModel'] = {};
    for (const row of byModelRows) {
      byModel[row.model_id] = {
        api: row.api,
        modelName: row.model_name,
        messages: row.messages,
        tokens: {
          input: row.input_tokens,
          output: row.output_tokens,
          cacheRead: row.cache_read_tokens,
          cacheWrite: row.cache_write_tokens,
          total: row.total_tokens,
        },
        cost: {
          input: row.cost_input,
          output: row.cost_output,
          cacheRead: row.cost_cache_read,
          cacheWrite: row.cost_cache_write,
          total: row.cost_total,
        },
      };
    }

    return {
      totalMessages: totals.total_messages,
      tokens: {
        input: totals.input_tokens,
        output: totals.output_tokens,
        cacheRead: totals.cache_read_tokens,
        cacheWrite: totals.cache_write_tokens,
        total: totals.total_tokens,
      },
      cost: {
        input: totals.cost_input,
        output: totals.cost_output,
        cacheRead: totals.cost_cache_read,
        cacheWrite: totals.cost_cache_write,
        total: totals.cost_total,
      },
      byApi,
      byModel,
    };
  }

  /**
   * Close the database connection.
   */
  close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * Get the database file path.
   */
  getDbPath(): string {
    return this.dbPath;
  }
}

/**
 * Create a SqliteUsageAdapter with the default database path.
 */
export function createSqliteUsageAdapter(dbPath?: string): SqliteUsageAdapter {
  return new SqliteUsageAdapter(dbPath);
}
