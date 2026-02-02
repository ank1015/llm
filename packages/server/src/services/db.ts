/**
 * Database Service
 *
 * SQLite database for storing LLM usage data.
 * Messages are stored in ~/.llm/global/usages/messages.db
 */

import { existsSync, mkdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';

import type { Api, BaseAssistantMessage } from '@ank1015/llm-types';

/** Directory for storing database */
const USAGES_DIR = join(homedir(), '.llm', 'global', 'usages');

/** Database file path */
const DB_PATH = join(USAGES_DIR, 'messages.db');

/** Database instance (singleton) */
let db: Database.Database | null = null;

/**
 * Ensure the usages directory exists.
 */
function ensureUsagesDir(): void {
  if (!existsSync(USAGES_DIR)) {
    mkdirSync(USAGES_DIR, { recursive: true });
  }
}

/**
 * Initialize the database and create tables if needed.
 */
function initDatabase(): Database.Database {
  if (db) return db;

  ensureUsagesDir();
  db = new Database(DB_PATH);

  // Enable WAL mode for better concurrent access
  db.pragma('journal_mode = WAL');

  // Create messages table
  db.exec(`
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
  db.exec(`
		CREATE INDEX IF NOT EXISTS idx_messages_api ON messages(api);
		CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
		CREATE INDEX IF NOT EXISTS idx_messages_model_id ON messages(model_id);
	`);

  return db;
}

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

  // Only set errorMessage if it exists (avoid undefined with exactOptionalPropertyTypes)
  if (row.error_message !== null) {
    message.errorMessage = row.error_message;
  }

  return message;
}

/**
 * Database Service for storing and retrieving LLM messages.
 */
export const DbService = {
  /**
   * Initialize the database.
   * Called automatically on first use, but can be called explicitly.
   */
  init(): void {
    initDatabase();
  },

  /**
   * Save a message to the database.
   *
   * @param message - The assistant message to save
   */
  saveMessage<TApi extends Api>(message: BaseAssistantMessage<TApi>): void {
    const db = initDatabase();

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
  },

  /**
   * Get a message by ID.
   *
   * @param id - The message ID
   * @returns The message or undefined if not found
   */
  getMessage<TApi extends Api>(id: string): BaseAssistantMessage<TApi> | undefined {
    const db = initDatabase();
    const stmt = db.prepare('SELECT * FROM messages WHERE id = ?');
    const row = stmt.get(id) as MessageRow | undefined;

    if (!row) return undefined;
    return rowToMessage<TApi>(row);
  },

  /**
   * Get messages with optional filters.
   *
   * @param options - Filter options
   * @returns Array of messages
   */
  getMessages<TApi extends Api>(options?: {
    api?: Api;
    modelId?: string;
    limit?: number;
    offset?: number;
    startTime?: number;
    endTime?: number;
  }): BaseAssistantMessage<TApi>[] {
    const db = initDatabase();

    let query = 'SELECT * FROM messages WHERE 1=1';
    const params: (string | number)[] = [];

    if (options?.api) {
      // eslint-disable-next-line sonarjs/no-duplicate-string
      query += ' AND api = ?';
      params.push(options.api);
    }

    if (options?.modelId) {
      // eslint-disable-next-line sonarjs/no-duplicate-string
      query += ' AND model_id = ?';
      params.push(options.modelId);
    }

    if (options?.startTime) {
      // eslint-disable-next-line sonarjs/no-duplicate-string
      query += ' AND timestamp >= ?';
      params.push(options.startTime);
    }

    if (options?.endTime) {
      // eslint-disable-next-line sonarjs/no-duplicate-string
      query += ' AND timestamp <= ?';
      params.push(options.endTime);
    }

    query += ' ORDER BY timestamp DESC';

    if (options?.limit) {
      query += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      query += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = db.prepare(query);
    const rows = stmt.all(...params) as MessageRow[];

    return rows.map((row) => rowToMessage<TApi>(row));
  },

  /**
   * Delete a message by ID.
   *
   * @param id - The message ID
   * @returns true if deleted, false if not found
   */
  deleteMessage(id: string): boolean {
    const db = initDatabase();
    const stmt = db.prepare('DELETE FROM messages WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  /**
   * Get usage statistics.
   *
   * @param options - Filter options
   * @returns Usage statistics
   */
  getUsageStats(options?: { api?: Api; modelId?: string; startTime?: number; endTime?: number }): {
    totalMessages: number;
    tokens: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
    cost: {
      input: number;
      output: number;
      cacheRead: number;
      cacheWrite: number;
      total: number;
    };
    byApi: Record<
      string,
      {
        messages: number;
        tokens: {
          input: number;
          output: number;
          cacheRead: number;
          cacheWrite: number;
          total: number;
        };
        cost: {
          input: number;
          output: number;
          cacheRead: number;
          cacheWrite: number;
          total: number;
        };
      }
    >;
    byModel: Record<
      string,
      {
        api: string;
        modelName: string;
        messages: number;
        tokens: {
          input: number;
          output: number;
          cacheRead: number;
          cacheWrite: number;
          total: number;
        };
        cost: {
          input: number;
          output: number;
          cacheRead: number;
          cacheWrite: number;
          total: number;
        };
      }
    >;
  } {
    const db = initDatabase();

    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (options?.api) {
      whereClause += ' AND api = ?';
      params.push(options.api);
    }

    if (options?.modelId) {
      whereClause += ' AND model_id = ?';
      params.push(options.modelId);
    }

    if (options?.startTime) {
      whereClause += ' AND timestamp >= ?';
      params.push(options.startTime);
    }

    if (options?.endTime) {
      whereClause += ' AND timestamp <= ?';
      params.push(options.endTime);
    }

    // Get totals with full breakdown
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

    // Get by API with full breakdown
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

    const byApi: Record<
      string,
      {
        messages: number;
        tokens: {
          input: number;
          output: number;
          cacheRead: number;
          cacheWrite: number;
          total: number;
        };
        cost: {
          input: number;
          output: number;
          cacheRead: number;
          cacheWrite: number;
          total: number;
        };
      }
    > = {};
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

    // Get by Model with full breakdown
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

    const byModel: Record<
      string,
      {
        api: string;
        modelName: string;
        messages: number;
        tokens: {
          input: number;
          output: number;
          cacheRead: number;
          cacheWrite: number;
          total: number;
        };
        cost: {
          input: number;
          output: number;
          cacheRead: number;
          cacheWrite: number;
          total: number;
        };
      }
    > = {};
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
  },

  /**
   * Get message summaries (metadata only, no content).
   *
   * @param options - Filter and pagination options
   * @returns Paginated message summaries
   */
  getMessagesSummary(options?: {
    api?: Api;
    modelId?: string;
    limit?: number;
    offset?: number;
    startTime?: number;
    endTime?: number;
  }): {
    messages: {
      id: string;
      api: string;
      modelId: string;
      modelName: string;
      timestamp: number;
      duration: number;
      stopReason: string;
      tokens: {
        input: number;
        output: number;
        cacheRead: number;
        cacheWrite: number;
        total: number;
      };
      cost: { input: number; output: number; cacheRead: number; cacheWrite: number; total: number };
    }[];
    pagination: {
      total: number;
      limit: number;
      offset: number;
      hasMore: boolean;
    };
  } {
    const db = initDatabase();
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;

    let whereClause = 'WHERE 1=1';
    const params: (string | number)[] = [];

    if (options?.api) {
      whereClause += ' AND api = ?';
      params.push(options.api);
    }

    if (options?.modelId) {
      whereClause += ' AND model_id = ?';
      params.push(options.modelId);
    }

    if (options?.startTime) {
      whereClause += ' AND timestamp >= ?';
      params.push(options.startTime);
    }

    if (options?.endTime) {
      whereClause += ' AND timestamp <= ?';
      params.push(options.endTime);
    }

    // Get total count
    const countStmt = db.prepare(`SELECT COUNT(*) as total FROM messages ${whereClause}`);
    const countResult = countStmt.get(...params) as { total: number };
    const total = countResult.total;

    // Get paginated messages (metadata only)
    const messagesStmt = db.prepare(`
			SELECT
				id, api, model_id, model_name, timestamp, duration, stop_reason,
				input_tokens, output_tokens, cache_read_tokens, cache_write_tokens, total_tokens,
				cost_input, cost_output, cost_cache_read, cost_cache_write, cost_total
			FROM messages ${whereClause}
			ORDER BY timestamp DESC
			LIMIT ? OFFSET ?
		`);
    const rows = messagesStmt.all(...params, limit, offset) as {
      id: string;
      api: string;
      model_id: string;
      model_name: string;
      timestamp: number;
      duration: number;
      stop_reason: string;
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

    const messages = rows.map((row) => ({
      id: row.id,
      api: row.api,
      modelId: row.model_id,
      modelName: row.model_name,
      timestamp: row.timestamp,
      duration: row.duration,
      stopReason: row.stop_reason,
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
    }));

    return {
      messages,
      pagination: {
        total,
        limit,
        offset,
        hasMore: offset + messages.length < total,
      },
    };
  },

  /**
   * Close the database connection.
   */
  close(): void {
    if (db) {
      db.close();
      db = null;
    }
  },

  /**
   * Get the database file path.
   */
  getDbPath(): string {
    return DB_PATH;
  },
};
