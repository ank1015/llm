import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { createGatewayAppWithServices } from '../../src/app.js';

import type { GatewayServices } from '../../src/context.js';
import type { Hono } from 'hono';

export async function createGatewayTestApp(): Promise<{
  adminHeaders: Record<string, string>;
  app: Hono;
  cleanup: () => Promise<void>;
  dbPath: string;
  services: GatewayServices;
}> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-gateway-test-'));
  const dbPath = join(directory, 'gateway.sqlite');
  const { app, services } = createGatewayAppWithServices({
    host: '127.0.0.1',
    port: 8123,
    dbPath,
    jwtSecret: 'test-jwt-secret',
    encryptionKey: Buffer.alloc(32, 7).toString('base64'),
    adminToken: 'test-admin-token',
    adminUsername: 'admin',
    adminPassword: 'admin-password',
    accessTtlSeconds: 60,
    refreshTtlSeconds: 300,
    corsOrigins: ['*'],
    logMode: 'full',
  });

  return {
    app: app as unknown as Hono,
    services,
    dbPath,
    adminHeaders: {
      Authorization: 'Bearer test-admin-token',
    },
    cleanup: async () => {
      services.db.close();
      await rm(directory, { recursive: true, force: true });
    },
  };
}

export async function issueSenderTokens(
  app: Hono,
  adminHeaders: Record<string, string>,
  name = 'Test Sender'
): Promise<{
  accessToken: string;
  refreshToken: string;
  senderId: string;
}> {
  const senderResponse = await jsonRequest(app, '/admin/senders', 'POST', { name }, adminHeaders);
  const senderBody = (await senderResponse.json()) as {
    sender: {
      id: string;
    };
  };

  const tokenResponse = await jsonRequest(
    app,
    `/admin/senders/${senderBody.sender.id}/tokens`,
    'POST',
    undefined,
    adminHeaders
  );
  const tokenBody = (await tokenResponse.json()) as {
    accessToken: string;
    refreshToken: string;
  };

  return {
    senderId: senderBody.sender.id,
    accessToken: tokenBody.accessToken,
    refreshToken: tokenBody.refreshToken,
  };
}

export function jsonRequest(
  app: Hono,
  path: string,
  method: string,
  body?: unknown,
  headers: Record<string, string> = {}
): Promise<Response> {
  return app.request(path, {
    method,
    headers: {
      ...headers,
      ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export async function readSseDataFrames(response: Response): Promise<unknown[]> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Expected SSE response body.');
  }

  const decoder = new TextDecoder();
  let payload = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    payload += decoder.decode(value, { stream: true });
  }

  payload += decoder.decode();

  return payload
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0 && !chunk.startsWith(':'))
    .map((chunk) => {
      const dataLine = chunk.split('\n').find((line) => line.startsWith('data: '));

      if (!dataLine) {
        throw new Error(`Malformed SSE frame: ${chunk}`);
      }

      return JSON.parse(dataLine.slice(6)) as unknown;
    });
}
