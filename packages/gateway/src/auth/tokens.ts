import { createHash, randomBytes, randomUUID } from 'node:crypto';

import { jwtVerify, SignJWT } from 'jose';

import { verifyPassword } from './passwords.js';

import type { GatewayConfig } from '../config.js';
import type { GatewayDatabase } from '../db/index.js';

export interface IssuedTokenPair {
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  refreshTokenId: string;
  senderId: string;
}

export interface AccessTokenVerification {
  senderId: string;
  tokenId: string;
}

export interface GatewayAuth {
  issueTokenPair(senderId: string): Promise<IssuedTokenPair>;
  loginWithPassword(username: string, password: string): Promise<IssuedTokenPair>;
  refresh(refreshToken: string): Promise<IssuedTokenPair>;
  revokeRefreshToken(refreshToken: string): boolean;
  verifyAccessToken(token: string): Promise<AccessTokenVerification>;
}

export class GatewayAuthError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(message: string, code: string, status: number) {
    super(message);
    this.name = 'GatewayAuthError';
    this.code = code;
    this.status = status;
  }
}

export function hashOpaqueToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function createGatewayAuth(db: GatewayDatabase, config: GatewayConfig): GatewayAuth {
  const secret = new TextEncoder().encode(config.jwtSecret);

  return {
    async issueTokenPair(senderId) {
      ensureActiveSender(db, senderId);
      return issueTokenPair(db, config, secret, senderId);
    },
    async loginWithPassword(username, password) {
      const sender = db.getSenderByUsername(username);
      if (!sender || !sender.passwordHash) {
        throw new GatewayAuthError('Username or password is invalid.', 'invalid_login', 401);
      }

      if (sender.disabledAt !== null) {
        throw new GatewayAuthError('Sender has been disabled.', 'sender_disabled', 403);
      }

      const valid = await verifyPassword(password, sender.passwordHash);
      if (!valid) {
        throw new GatewayAuthError('Username or password is invalid.', 'invalid_login', 401);
      }

      return issueTokenPair(db, config, secret, sender.id);
    },
    async refresh(refreshToken) {
      const tokenHash = hashOpaqueToken(refreshToken);
      const existing = db.getRefreshTokenByHash(tokenHash);
      if (!existing) {
        throw new GatewayAuthError('Refresh token is invalid.', 'invalid_refresh_token', 401);
      }

      const now = Date.now();
      if (existing.revokedAt !== null) {
        throw new GatewayAuthError('Refresh token has been revoked.', 'revoked_refresh_token', 401);
      }

      if (existing.expiresAt <= now) {
        db.revokeRefreshTokenById(existing.id, now);
        throw new GatewayAuthError('Refresh token has expired.', 'expired_refresh_token', 401);
      }

      ensureActiveSender(db, existing.senderId);
      db.revokeRefreshTokenById(existing.id, now);
      return issueTokenPair(db, config, secret, existing.senderId);
    },
    revokeRefreshToken(refreshToken) {
      const tokenHash = hashOpaqueToken(refreshToken);
      const existing = db.getRefreshTokenByHash(tokenHash);
      if (!existing) {
        return false;
      }

      return db.revokeRefreshTokenById(existing.id);
    },
    async verifyAccessToken(token) {
      try {
        const result = await jwtVerify(token, secret, {
          algorithms: ['HS256'],
        });
        const senderId = result.payload.sub;
        const tokenId = result.payload['tid'];

        if (typeof senderId !== 'string' || typeof tokenId !== 'string') {
          throw new GatewayAuthError(
            'Access token is missing required claims.',
            'invalid_access_token',
            401
          );
        }

        return {
          senderId,
          tokenId,
        };
      } catch (error) {
        if (error instanceof GatewayAuthError) {
          throw error;
        }

        throw new GatewayAuthError('Access token is invalid.', 'invalid_access_token', 401);
      }
    },
  };
}

async function issueTokenPair(
  db: GatewayDatabase,
  config: GatewayConfig,
  secret: Uint8Array,
  senderId: string
): Promise<IssuedTokenPair> {
  const nowSeconds = Math.floor(Date.now() / 1000);
  const accessTokenExpiresAt = (nowSeconds + config.accessTtlSeconds) * 1000;
  const refreshTokenExpiresAt = (nowSeconds + config.refreshTtlSeconds) * 1000;
  const refreshTokenId = randomUUID();
  const refreshToken = randomBytes(32).toString('base64url');

  db.insertRefreshToken({
    id: refreshTokenId,
    senderId,
    tokenHash: hashOpaqueToken(refreshToken),
    issuedAt: nowSeconds * 1000,
    expiresAt: refreshTokenExpiresAt,
    revokedAt: null,
  });

  const accessToken = await new SignJWT({ tid: refreshTokenId })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(senderId)
    .setIssuedAt(nowSeconds)
    .setExpirationTime(nowSeconds + config.accessTtlSeconds)
    .sign(secret);

  return {
    accessToken,
    accessTokenExpiresAt,
    refreshToken,
    refreshTokenExpiresAt,
    refreshTokenId,
    senderId,
  };
}

function ensureActiveSender(db: GatewayDatabase, senderId: string): void {
  const sender = db.getSenderById(senderId);
  if (!sender) {
    throw new GatewayAuthError('Sender does not exist.', 'sender_not_found', 404);
  }

  if (sender.disabledAt !== null) {
    throw new GatewayAuthError('Sender has been disabled.', 'sender_disabled', 403);
  }
}
