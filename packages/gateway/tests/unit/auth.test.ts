import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';

import { hashPassword, verifyPassword } from '../../src/auth/passwords.js';
import { createGatewayAuth, GatewayAuthError } from '../../src/auth/tokens.js';
import { getGatewayConfig } from '../../src/config.js';
import { createGatewayDatabase } from '../../src/db/index.js';

const tempDirectories: string[] = [];

async function createTempDbPath(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-gateway-auth-'));
  tempDirectories.push(directory);
  return join(directory, 'gateway.sqlite');
}

afterEach(async () => {
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('gateway auth', () => {
  it('hashes and verifies passwords', async () => {
    const encodedHash = await hashPassword('correct horse battery staple');

    expect(encodedHash).toMatch(/^scrypt\$/u);
    expect(await verifyPassword('correct horse battery staple', encodedHash)).toBe(true);
    expect(await verifyPassword('wrong password', encodedHash)).toBe(false);
  });

  it('issues, verifies, refreshes, and revokes token pairs', async () => {
    const dbPath = await createTempDbPath();
    const config = getGatewayConfig({
      dbPath,
      jwtSecret: 'jwt-secret',
      encryptionKey: Buffer.alloc(32, 5).toString('base64'),
      adminToken: 'admin-token',
      accessTtlSeconds: 60,
      refreshTtlSeconds: 300,
    });
    const db = createGatewayDatabase(config);
    const auth = createGatewayAuth(db, config);
    const sender = db.createSender({ name: 'Sender One' });

    const firstPair = await auth.issueTokenPair(sender.id);
    const verification = await auth.verifyAccessToken(firstPair.accessToken);

    expect(verification.senderId).toBe(sender.id);

    const refreshedPair = await auth.refresh(firstPair.refreshToken);
    expect(refreshedPair.refreshToken).not.toBe(firstPair.refreshToken);

    await expect(auth.refresh(firstPair.refreshToken)).rejects.toBeInstanceOf(GatewayAuthError);

    expect(auth.revokeRefreshToken(refreshedPair.refreshToken)).toBe(true);
    await expect(auth.refresh(refreshedPair.refreshToken)).rejects.toBeInstanceOf(GatewayAuthError);

    db.close();
  });

  it('logs in password-backed senders', async () => {
    const dbPath = await createTempDbPath();
    const config = getGatewayConfig({
      dbPath,
      jwtSecret: 'jwt-secret',
      encryptionKey: Buffer.alloc(32, 5).toString('base64'),
      adminToken: 'admin-token',
      accessTtlSeconds: 60,
      refreshTtlSeconds: 300,
    });
    const db = createGatewayDatabase(config);
    const auth = createGatewayAuth(db, config);
    const sender = db.createSender({
      name: 'Alice',
      username: 'alice',
      passwordHash: await hashPassword('alice-password'),
    });

    const pair = await auth.loginWithPassword('alice', 'alice-password');

    expect(pair.senderId).toBe(sender.id);
    await expect(auth.loginWithPassword('alice', 'wrong-password')).rejects.toEqual(
      expect.objectContaining({
        code: 'invalid_login',
      })
    );

    db.close();
  });

  it('rejects disabled senders', async () => {
    const dbPath = await createTempDbPath();
    const config = getGatewayConfig({
      dbPath,
      jwtSecret: 'jwt-secret',
      encryptionKey: Buffer.alloc(32, 5).toString('base64'),
      adminToken: 'admin-token',
    });
    const db = createGatewayDatabase(config);
    const auth = createGatewayAuth(db, config);
    const sender = db.createSender({ name: 'Disabled Sender' });

    const rawDb = new Database(dbPath);
    rawDb.prepare('UPDATE senders SET disabled_at = ? WHERE id = ?').run(Date.now(), sender.id);
    rawDb.close();

    await expect(auth.issueTokenPair(sender.id)).rejects.toEqual(
      expect.objectContaining({
        code: 'sender_disabled',
      })
    );

    db.close();
  });
});
