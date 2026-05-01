import { randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

import Database from 'better-sqlite3';

import type { GatewayConfig } from '../config.js';

export type RequestKind = 'image' | 'llm';
export type RequestStatus = 'aborted' | 'error' | 'ok' | 'running';

export interface SenderRecord {
  id: string;
  name: string;
  username: string | null;
  passwordHash: string | null;
  createdAt: number;
  disabledAt: number | null;
}

export interface RefreshTokenRecord {
  id: string;
  senderId: string;
  tokenHash: string;
  issuedAt: number;
  expiresAt: number;
  revokedAt: number | null;
}

export interface ProviderKeyRecord {
  api: string;
  ciphertext: Buffer;
  iv: Buffer;
  tag: Buffer;
  updatedAt: number;
}

export interface RequestRecord {
  id: string;
  clientRequestId: string | null;
  senderId: string | null;
  kind: RequestKind;
  api: string;
  modelId: string;
  startedAt: number;
  endedAt: number | null;
  status: RequestStatus;
  inputTokens: number | null;
  outputTokens: number | null;
  totalTokens: number | null;
  costUsd: number | null;
  errorCode: string | null;
  errorMessage: string | null;
  inputJson: string | null;
  outputJson: string | null;
}

export interface RequestEventRecord {
  requestId: string;
  seq: number;
  timestamp: number;
  eventJson: string;
}

export interface UsageSummary {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
}

export type UsageBreakdownDimension = 'api' | 'apiModel' | 'senderId';

export interface UsageBreakdownRow {
  key: string;
  api: string | null;
  modelId: string | null;
  senderId: string | null;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  errorCount: number;
  lastStartedAt: number | null;
}

export type TimelineBucket = 'day' | 'hour';

export interface TimelineRow {
  bucket: number;
  ok: number;
  error: number;
  aborted: number;
  running: number;
  totalTokens: number;
  costUsd: number;
}

export class GatewayDatabaseError extends Error {
  readonly code: 'request_running';

  constructor(code: 'request_running', message: string) {
    super(message);
    this.code = code;
    this.name = 'GatewayDatabaseError';
  }
}

export class DeleteRequestError extends Error {
  readonly code: 'not_found' | 'running';

  constructor(code: 'not_found' | 'running', message: string) {
    super(message);
    this.name = 'DeleteRequestError';
    this.code = code;
  }
}

export interface GatewayDatabase {
  close(): void;
  completeRequest(input: {
    id: string;
    status: Exclude<RequestStatus, 'running'>;
    endedAt?: number;
    inputTokens?: number | null;
    outputTokens?: number | null;
    totalTokens?: number | null;
    costUsd?: number | null;
    errorCode?: string | null;
    errorMessage?: string | null;
    outputJson?: string | null;
  }): void;
  createSender(input: {
    id?: string;
    name: string;
    passwordHash?: string;
    username?: string;
  }): SenderRecord;
  deleteProviderKey(api: string): boolean;
  /**
   * Hard-deletes a request row and its events. Throws DeleteRequestError with
   * code "running" when the request has not completed yet, and "not_found" when
   * the id does not exist.
   */
  deleteRequest(id: string): void;
  /**
   * Hard-deletes a sender. Any request rows that referenced the sender are
   * anonymized (sender_id set to NULL). Associated refresh tokens are removed.
   * Returns true if a sender row was deleted.
   */
  deleteSender(id: string): boolean;
  getProviderKey(api: string): ProviderKeyRecord | undefined;
  getRequestById(id: string): { events: RequestEventRecord[]; request: RequestRecord } | undefined;
  getSenderById(id: string): SenderRecord | undefined;
  getSenderByUsername(username: string): SenderRecord | undefined;
  getRefreshTokenById(id: string): RefreshTokenRecord | undefined;
  getUsageSummary(filters?: { from?: number; senderId?: string; to?: number }): UsageSummary;
  getRefreshTokenByHash(tokenHash: string): RefreshTokenRecord | undefined;
  getRequestsTimeline(filters?: {
    bucket?: TimelineBucket;
    from?: number;
    senderId?: string;
    to?: number;
  }): TimelineRow[];
  getUsageBreakdown(input: {
    by: UsageBreakdownDimension;
    from?: number;
    limit?: number;
    senderId?: string;
    to?: number;
  }): UsageBreakdownRow[];
  insertRefreshToken(input: RefreshTokenRecord): void;
  listRefreshTokensBySender(senderId: string): RefreshTokenRecord[];
  revokeRefreshTokensBySender(senderId: string, revokedAt?: number): number;
  setSenderDisabled(senderId: string, disabledAt: number | null): boolean;
  insertRequest(input: {
    id: string;
    clientRequestId?: string | undefined;
    senderId: string;
    kind: RequestKind;
    api: string;
    modelId: string;
    inputJson?: string | null | undefined;
    startedAt?: number;
  }): void;
  insertRequestEvent(input: RequestEventRecord): void;
  listProviderKeys(): ProviderKeyRecord[];
  listRequests(filters?: {
    from?: number;
    limit?: number;
    senderId?: string;
    to?: number;
  }): RequestRecord[];
  listSenders(): SenderRecord[];
  revokeRefreshTokenById(id: string, revokedAt?: number): boolean;
  upsertProviderKey(input: ProviderKeyRecord): void;
}

const INIT_SQL = `
PRAGMA user_version = 1;

CREATE TABLE IF NOT EXISTS senders (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  username TEXT,
  password_hash TEXT,
  created_at INTEGER NOT NULL,
  disabled_at INTEGER
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id TEXT PRIMARY KEY,
  sender_id TEXT NOT NULL REFERENCES senders(id),
  token_hash TEXT NOT NULL UNIQUE,
  issued_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  revoked_at INTEGER
);

CREATE TABLE IF NOT EXISTS provider_keys (
  api TEXT PRIMARY KEY,
  ciphertext BLOB NOT NULL,
  iv BLOB NOT NULL,
  tag BLOB NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  client_request_id TEXT,
  sender_id TEXT REFERENCES senders(id) ON DELETE SET NULL,
  kind TEXT NOT NULL CHECK (kind IN ('llm', 'image')),
  api TEXT NOT NULL,
  model_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  ended_at INTEGER,
  status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error', 'aborted')),
  input_tokens INTEGER,
  output_tokens INTEGER,
  total_tokens INTEGER,
  cost_usd REAL,
  error_code TEXT,
  error_message TEXT,
  input_json TEXT,
  output_json TEXT
);

CREATE TABLE IF NOT EXISTS request_events (
  request_id TEXT NOT NULL REFERENCES requests(id) ON DELETE CASCADE,
  seq INTEGER NOT NULL,
  timestamp INTEGER NOT NULL,
  event_json TEXT NOT NULL,
  PRIMARY KEY (request_id, seq)
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_sender_id ON refresh_tokens(sender_id);
CREATE INDEX IF NOT EXISTS idx_refresh_tokens_expires_at ON refresh_tokens(expires_at);
CREATE UNIQUE INDEX IF NOT EXISTS idx_senders_username ON senders(username) WHERE username IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_requests_sender_id_started_at ON requests(sender_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_requests_started_at ON requests(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_request_events_request_id ON request_events(request_id, seq);
`;

export function createGatewayDatabase(config: GatewayConfig): GatewayDatabase {
  if (config.dbPath !== ':memory:') {
    mkdirSync(dirname(config.dbPath), { recursive: true });
  }

  const database = new Database(config.dbPath);
  database.pragma('foreign_keys = ON');
  database.exec(INIT_SQL);
  ensureSenderCredentialColumns(database);
  ensureRequestsSenderNullable(database);

  const createSenderStatement = database.prepare(`
    INSERT INTO senders (id, name, username, password_hash, created_at, disabled_at)
    VALUES (@id, @name, @username, @passwordHash, @createdAt, @disabledAt)
  `);
  const getSenderByIdStatement = database.prepare(`
    SELECT
      id,
      name,
      username,
      password_hash AS passwordHash,
      created_at AS createdAt,
      disabled_at AS disabledAt
    FROM senders
    WHERE id = ?
  `);
  const getSenderByUsernameStatement = database.prepare(`
    SELECT
      id,
      name,
      username,
      password_hash AS passwordHash,
      created_at AS createdAt,
      disabled_at AS disabledAt
    FROM senders
    WHERE username = ?
  `);
  const listSendersStatement = database.prepare(`
    SELECT
      id,
      name,
      username,
      password_hash AS passwordHash,
      created_at AS createdAt,
      disabled_at AS disabledAt
    FROM senders
    ORDER BY created_at DESC
  `);
  const insertRefreshTokenStatement = database.prepare(`
    INSERT INTO refresh_tokens (id, sender_id, token_hash, issued_at, expires_at, revoked_at)
    VALUES (@id, @senderId, @tokenHash, @issuedAt, @expiresAt, @revokedAt)
  `);
  const getRefreshTokenByHashStatement = database.prepare(`
    SELECT
      id,
      sender_id AS senderId,
      token_hash AS tokenHash,
      issued_at AS issuedAt,
      expires_at AS expiresAt,
      revoked_at AS revokedAt
    FROM refresh_tokens
    WHERE token_hash = ?
  `);
  const getRefreshTokenByIdStatement = database.prepare(`
    SELECT
      id,
      sender_id AS senderId,
      token_hash AS tokenHash,
      issued_at AS issuedAt,
      expires_at AS expiresAt,
      revoked_at AS revokedAt
    FROM refresh_tokens
    WHERE id = ?
  `);
  const revokeRefreshTokenByIdStatement = database.prepare(`
    UPDATE refresh_tokens
    SET revoked_at = ?
    WHERE id = ? AND revoked_at IS NULL
  `);
  const listRefreshTokensBySenderStatement = database.prepare(`
    SELECT
      id,
      sender_id AS senderId,
      token_hash AS tokenHash,
      issued_at AS issuedAt,
      expires_at AS expiresAt,
      revoked_at AS revokedAt
    FROM refresh_tokens
    WHERE sender_id = ?
    ORDER BY issued_at DESC
  `);
  const revokeRefreshTokensBySenderStatement = database.prepare(`
    UPDATE refresh_tokens
    SET revoked_at = @revokedAt
    WHERE sender_id = @senderId AND revoked_at IS NULL
  `);
  const setSenderDisabledStatement = database.prepare(`
    UPDATE senders
    SET disabled_at = ?
    WHERE id = ?
  `);
  const upsertProviderKeyStatement = database.prepare(`
    INSERT INTO provider_keys (api, ciphertext, iv, tag, updated_at)
    VALUES (@api, @ciphertext, @iv, @tag, @updatedAt)
    ON CONFLICT(api) DO UPDATE SET
      ciphertext = excluded.ciphertext,
      iv = excluded.iv,
      tag = excluded.tag,
      updated_at = excluded.updated_at
  `);
  const getProviderKeyStatement = database.prepare(`
    SELECT
      api,
      ciphertext,
      iv,
      tag,
      updated_at AS updatedAt
    FROM provider_keys
    WHERE api = ?
  `);
  const listProviderKeysStatement = database.prepare(`
    SELECT
      api,
      ciphertext,
      iv,
      tag,
      updated_at AS updatedAt
    FROM provider_keys
    ORDER BY api ASC
  `);
  const insertRequestStatement = database.prepare(`
    INSERT INTO requests (
      id,
      client_request_id,
      sender_id,
      kind,
      api,
      model_id,
      started_at,
      ended_at,
      status,
      input_tokens,
      output_tokens,
      total_tokens,
      cost_usd,
      error_code,
      error_message,
      input_json,
      output_json
    )
    VALUES (
      @id,
      @clientRequestId,
      @senderId,
      @kind,
      @api,
      @modelId,
      @startedAt,
      NULL,
      'running',
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      NULL,
      @inputJson,
      NULL
    )
  `);
  const completeRequestStatement = database.prepare(`
    UPDATE requests
    SET
      ended_at = @endedAt,
      status = @status,
      input_tokens = @inputTokens,
      output_tokens = @outputTokens,
      total_tokens = @totalTokens,
      cost_usd = @costUsd,
      error_code = @errorCode,
      error_message = @errorMessage,
      output_json = @outputJson
    WHERE id = @id
  `);
  const insertRequestEventStatement = database.prepare(`
    INSERT OR REPLACE INTO request_events (request_id, seq, timestamp, event_json)
    VALUES (@requestId, @seq, @timestamp, @eventJson)
  `);
  const getRequestByIdStatement = database.prepare(`
    SELECT
      id,
      client_request_id AS clientRequestId,
      sender_id AS senderId,
      kind,
      api,
      model_id AS modelId,
      started_at AS startedAt,
      ended_at AS endedAt,
      status,
      input_tokens AS inputTokens,
      output_tokens AS outputTokens,
      total_tokens AS totalTokens,
      cost_usd AS costUsd,
      error_code AS errorCode,
      error_message AS errorMessage,
      input_json AS inputJson,
      output_json AS outputJson
    FROM requests
    WHERE id = ?
  `);
  const getRequestEventsStatement = database.prepare(`
    SELECT
      request_id AS requestId,
      seq,
      timestamp,
      event_json AS eventJson
    FROM request_events
    WHERE request_id = ?
    ORDER BY seq ASC
  `);
  const deleteRequestStatement = database.prepare(`DELETE FROM requests WHERE id = ?`);
  const getRequestStatusStatement = database.prepare(`SELECT status FROM requests WHERE id = ?`);
  const deleteRefreshTokensBySenderStatement = database.prepare(
    `DELETE FROM refresh_tokens WHERE sender_id = ?`
  );
  const deleteSenderStatement = database.prepare(`DELETE FROM senders WHERE id = ?`);
  const deleteProviderKeyStatement = database.prepare(`DELETE FROM provider_keys WHERE api = ?`);

  const deleteSenderTransaction = database.transaction((senderId: string) => {
    deleteRefreshTokensBySenderStatement.run(senderId);
    return deleteSenderStatement.run(senderId).changes > 0;
  });

  return {
    close() {
      database.close();
    },
    completeRequest(input) {
      completeRequestStatement.run({
        id: input.id,
        endedAt: input.endedAt ?? Date.now(),
        status: input.status,
        inputTokens: input.inputTokens ?? null,
        outputTokens: input.outputTokens ?? null,
        totalTokens: input.totalTokens ?? null,
        costUsd: input.costUsd ?? null,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        outputJson: input.outputJson ?? null,
      });
    },
    createSender(input) {
      const now = Date.now();
      const id = input.id ?? randomUUID();
      const username = input.username?.trim() ?? null;

      createSenderStatement.run({
        id,
        name: input.name,
        username,
        passwordHash: input.passwordHash ?? null,
        createdAt: now,
        disabledAt: null,
      });

      return getSenderByIdStatement.get(id) as SenderRecord;
    },
    deleteProviderKey(api) {
      return deleteProviderKeyStatement.run(api).changes > 0;
    },
    deleteRequest(id) {
      const existing = getRequestStatusStatement.get(id) as { status: RequestStatus } | undefined;
      if (!existing) {
        throw new DeleteRequestError('not_found', `Request "${id}" was not found.`);
      }

      if (existing.status === 'running') {
        throw new DeleteRequestError(
          'running',
          'Cannot delete a running request. Wait for it to finish or abort it first.'
        );
      }

      deleteRequestStatement.run(id);
    },
    deleteSender(id) {
      return deleteSenderTransaction(id);
    },
    getProviderKey(api) {
      return getProviderKeyStatement.get(api) as ProviderKeyRecord | undefined;
    },
    getRequestById(id) {
      const request = getRequestByIdStatement.get(id) as RequestRecord | undefined;
      if (!request) {
        return undefined;
      }

      const events = getRequestEventsStatement.all(id) as RequestEventRecord[];
      return {
        request,
        events,
      };
    },
    getSenderById(id) {
      return getSenderByIdStatement.get(id) as SenderRecord | undefined;
    },
    getSenderByUsername(username) {
      return getSenderByUsernameStatement.get(username) as SenderRecord | undefined;
    },
    getRefreshTokenById(id) {
      return getRefreshTokenByIdStatement.get(id) as RefreshTokenRecord | undefined;
    },
    getUsageSummary(filters = {}) {
      const { clause, params } = buildRequestFilters(filters);
      const statement = database.prepare(`
        SELECT
          COUNT(*) AS requestCount,
          COALESCE(SUM(input_tokens), 0) AS inputTokens,
          COALESCE(SUM(output_tokens), 0) AS outputTokens,
          COALESCE(SUM(total_tokens), 0) AS totalTokens,
          COALESCE(SUM(cost_usd), 0) AS costUsd
        FROM requests
        ${clause}
      `);

      return statement.get(...params) as UsageSummary;
    },
    getRefreshTokenByHash(tokenHash) {
      return getRefreshTokenByHashStatement.get(tokenHash) as RefreshTokenRecord | undefined;
    },
    getRequestsTimeline(filters = {}) {
      const bucket: TimelineBucket = filters.bucket ?? 'hour';
      const bucketMs = bucket === 'hour' ? 3_600_000 : 86_400_000;
      const { clause, params } = buildRequestFilters(filters);
      const statement = database.prepare(`
        SELECT
          (started_at / ${bucketMs}) * ${bucketMs} AS bucket,
          SUM(CASE WHEN status = 'ok' THEN 1 ELSE 0 END) AS ok,
          SUM(CASE WHEN status = 'error' THEN 1 ELSE 0 END) AS error,
          SUM(CASE WHEN status = 'aborted' THEN 1 ELSE 0 END) AS aborted,
          SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) AS running,
          COALESCE(SUM(total_tokens), 0) AS totalTokens,
          COALESCE(SUM(cost_usd), 0) AS costUsd
        FROM requests
        ${clause}
        GROUP BY bucket
        ORDER BY bucket ASC
      `);

      return statement.all(...params) as TimelineRow[];
    },
    getUsageBreakdown(input) {
      const { by } = input;
      const { clause, params } = buildRequestFilters({
        ...(input.from !== undefined ? { from: input.from } : {}),
        ...(input.to !== undefined ? { to: input.to } : {}),
        ...(input.senderId ? { senderId: input.senderId } : {}),
      });
      const groupExpr =
        by === 'api' ? 'api' : by === 'senderId' ? 'sender_id' : "api || '/' || model_id";
      const statement = database.prepare(`
        SELECT
          ${groupExpr} AS key,
          api AS api,
          model_id AS modelId,
          sender_id AS senderId,
          COUNT(*) AS requestCount,
          COALESCE(SUM(input_tokens), 0) AS inputTokens,
          COALESCE(SUM(output_tokens), 0) AS outputTokens,
          COALESCE(SUM(total_tokens), 0) AS totalTokens,
          COALESCE(SUM(cost_usd), 0) AS costUsd,
          SUM(CASE WHEN status IN ('error', 'aborted') THEN 1 ELSE 0 END) AS errorCount,
          MAX(started_at) AS lastStartedAt
        FROM requests
        ${clause}
        GROUP BY ${groupExpr}
        ORDER BY requestCount DESC
        LIMIT ?
      `);
      const limit = Math.max(1, Math.min(input.limit ?? 50, 200));
      const rows = statement.all(...params, limit) as Array<{
        key: string;
        api: string;
        modelId: string;
        senderId: string;
        requestCount: number;
        inputTokens: number;
        outputTokens: number;
        totalTokens: number;
        costUsd: number;
        errorCount: number;
        lastStartedAt: number | null;
      }>;

      return rows.map((row) => ({
        key: row.key,
        api: by === 'senderId' ? null : row.api,
        modelId: by === 'apiModel' ? row.modelId : null,
        senderId: by === 'senderId' ? row.senderId : null,
        requestCount: row.requestCount,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        totalTokens: row.totalTokens,
        costUsd: row.costUsd,
        errorCount: row.errorCount,
        lastStartedAt: row.lastStartedAt,
      }));
    },
    insertRefreshToken(input) {
      insertRefreshTokenStatement.run(input);
    },
    listRefreshTokensBySender(senderId) {
      return listRefreshTokensBySenderStatement.all(senderId) as RefreshTokenRecord[];
    },
    revokeRefreshTokensBySender(senderId, revokedAt = Date.now()) {
      return revokeRefreshTokensBySenderStatement.run({ senderId, revokedAt }).changes;
    },
    setSenderDisabled(senderId, disabledAt) {
      return setSenderDisabledStatement.run(disabledAt, senderId).changes > 0;
    },
    insertRequest(input) {
      insertRequestStatement.run({
        id: input.id,
        clientRequestId: input.clientRequestId ?? null,
        senderId: input.senderId,
        kind: input.kind,
        api: input.api,
        modelId: input.modelId,
        startedAt: input.startedAt ?? Date.now(),
        inputJson: input.inputJson ?? null,
      });
    },
    insertRequestEvent(input) {
      insertRequestEventStatement.run(input);
    },
    listProviderKeys() {
      return listProviderKeysStatement.all() as ProviderKeyRecord[];
    },
    listRequests(filters = {}) {
      const { clause, params } = buildRequestFilters(filters);
      const limit = Math.max(1, Math.min(filters.limit ?? 50, 200));
      const statement = database.prepare(`
        SELECT
          id,
          client_request_id AS clientRequestId,
          sender_id AS senderId,
          kind,
          api,
          model_id AS modelId,
          started_at AS startedAt,
          ended_at AS endedAt,
          status,
          input_tokens AS inputTokens,
          output_tokens AS outputTokens,
          total_tokens AS totalTokens,
          cost_usd AS costUsd,
          error_code AS errorCode,
          error_message AS errorMessage,
          input_json AS inputJson,
          output_json AS outputJson
        FROM requests
        ${clause}
        ORDER BY started_at DESC
        LIMIT ?
      `);

      return statement.all(...params, limit) as RequestRecord[];
    },
    listSenders() {
      return listSendersStatement.all() as SenderRecord[];
    },
    revokeRefreshTokenById(id, revokedAt = Date.now()) {
      return revokeRefreshTokenByIdStatement.run(revokedAt, id).changes > 0;
    },
    upsertProviderKey(input) {
      upsertProviderKeyStatement.run(input);
    },
  };
}

function ensureRequestsSenderNullable(database: Database.Database): void {
  const columns = database.pragma('table_info(requests)') as Array<{
    name: string;
    notnull: number;
  }>;
  const senderColumn = columns.find((column) => column.name === 'sender_id');
  if (!senderColumn) {
    return;
  }

  const fks = database.pragma('foreign_key_list(requests)') as Array<{
    table: string;
    from: string;
    on_delete: string;
  }>;
  const senderFk = fks.find((fk) => fk.from === 'sender_id' && fk.table === 'senders');
  const needsMigration = senderColumn.notnull === 1 || senderFk?.on_delete !== 'SET NULL';
  if (!needsMigration) {
    return;
  }

  const migrate = database.transaction(() => {
    database.exec(`
      CREATE TABLE requests_new (
        id TEXT PRIMARY KEY,
        client_request_id TEXT,
        sender_id TEXT REFERENCES senders(id) ON DELETE SET NULL,
        kind TEXT NOT NULL CHECK (kind IN ('llm', 'image')),
        api TEXT NOT NULL,
        model_id TEXT NOT NULL,
        started_at INTEGER NOT NULL,
        ended_at INTEGER,
        status TEXT NOT NULL CHECK (status IN ('running', 'ok', 'error', 'aborted')),
        input_tokens INTEGER,
        output_tokens INTEGER,
        total_tokens INTEGER,
        cost_usd REAL,
        error_code TEXT,
        error_message TEXT,
        input_json TEXT,
        output_json TEXT
      );
    `);
    database.exec(`
      INSERT INTO requests_new (
        id, client_request_id, sender_id, kind, api, model_id, started_at,
        ended_at, status, input_tokens, output_tokens, total_tokens, cost_usd,
        error_code, error_message, input_json, output_json
      )
      SELECT
        id, client_request_id, sender_id, kind, api, model_id, started_at,
        ended_at, status, input_tokens, output_tokens, total_tokens, cost_usd,
        error_code, error_message, input_json, output_json
      FROM requests;
    `);
    database.exec('DROP TABLE requests;');
    database.exec('ALTER TABLE requests_new RENAME TO requests;');
    database.exec(
      'CREATE INDEX IF NOT EXISTS idx_requests_sender_id_started_at ON requests(sender_id, started_at DESC);'
    );
    database.exec(
      'CREATE INDEX IF NOT EXISTS idx_requests_started_at ON requests(started_at DESC);'
    );
  });

  database.pragma('foreign_keys = OFF');
  try {
    migrate();
  } finally {
    database.pragma('foreign_keys = ON');
  }
}

function ensureSenderCredentialColumns(database: Database.Database): void {
  const columns = database.pragma('table_info(senders)') as Array<{ name: string }>;
  const columnNames = new Set(columns.map((column) => column.name));

  if (!columnNames.has('username')) {
    database.exec('ALTER TABLE senders ADD COLUMN username TEXT');
  }

  if (!columnNames.has('password_hash')) {
    database.exec('ALTER TABLE senders ADD COLUMN password_hash TEXT');
  }

  database.exec(
    'CREATE UNIQUE INDEX IF NOT EXISTS idx_senders_username ON senders(username) WHERE username IS NOT NULL'
  );
}

function buildRequestFilters(filters: { from?: number; senderId?: string; to?: number }): {
  clause: string;
  params: Array<number | string>;
} {
  const conditions: string[] = [];
  const params: Array<number | string> = [];

  if (filters.senderId) {
    conditions.push('sender_id = ?');
    params.push(filters.senderId);
  }

  if (filters.from !== undefined) {
    conditions.push('started_at >= ?');
    params.push(filters.from);
  }

  if (filters.to !== undefined) {
    conditions.push('started_at <= ?');
    params.push(filters.to);
  }

  return {
    clause: conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '',
    params,
  };
}
