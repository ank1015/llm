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
  senderId: string;
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
  getProviderKey(api: string): ProviderKeyRecord | undefined;
  getRequestById(id: string): { events: RequestEventRecord[]; request: RequestRecord } | undefined;
  getSenderById(id: string): SenderRecord | undefined;
  getSenderByUsername(username: string): SenderRecord | undefined;
  getUsageSummary(filters?: { from?: number; senderId?: string; to?: number }): UsageSummary;
  getRefreshTokenByHash(tokenHash: string): RefreshTokenRecord | undefined;
  insertRefreshToken(input: RefreshTokenRecord): void;
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
  sender_id TEXT NOT NULL REFERENCES senders(id),
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
  const revokeRefreshTokenByIdStatement = database.prepare(`
    UPDATE refresh_tokens
    SET revoked_at = ?
    WHERE id = ? AND revoked_at IS NULL
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
    insertRefreshToken(input) {
      insertRefreshTokenStatement.run(input);
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
