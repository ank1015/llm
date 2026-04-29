import type { GatewayConfig } from './config.js';
import type { Context } from 'hono';

export type RateLimitGroup = 'authenticated' | 'login' | 'unauthenticated';

export interface RateLimitCheck {
  group: RateLimitGroup;
  identifier: string;
}

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  resetAt: number;
  retryAfterSeconds: number;
}

export interface RateLimiter {
  check(input: RateLimitCheck): RateLimitResult;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export function createInMemoryRateLimiter(
  config: GatewayConfig,
  now: () => number = () => Date.now()
): RateLimiter {
  const buckets = new Map<string, RateLimitBucket>();

  return {
    check(input) {
      const rule = getRule(config, input.group);
      const currentTime = now();
      const resetAt = currentTime + rule.windowMs;

      if (!config.rateLimitEnabled) {
        return {
          allowed: true,
          limit: rule.max,
          remaining: rule.max,
          resetAt,
          retryAfterSeconds: 0,
        };
      }

      const key = `${input.group}:${input.identifier}`;
      const existing = buckets.get(key);
      const bucket =
        existing && existing.resetAt > currentTime
          ? existing
          : {
              count: 0,
              resetAt,
            };

      bucket.count += 1;
      buckets.set(key, bucket);
      pruneExpiredBuckets(buckets, currentTime);

      const remaining = Math.max(0, rule.max - bucket.count);
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.resetAt - currentTime) / 1_000));

      return {
        allowed: bucket.count <= rule.max,
        limit: rule.max,
        remaining,
        resetAt: bucket.resetAt,
        retryAfterSeconds: bucket.count <= rule.max ? 0 : retryAfterSeconds,
      };
    },
  };
}

export function getClientIdentifier(c: Context, config: GatewayConfig): string {
  if (config.trustProxy) {
    const forwardedFor = c.req.header('X-Forwarded-For');
    const firstForwardedFor = forwardedFor
      ?.split(',')
      .map((value) => value.trim())
      .find((value) => value.length > 0);
    if (firstForwardedFor) {
      return firstForwardedFor;
    }

    const realIp = c.req.header('X-Real-IP')?.trim();
    if (realIp) {
      return realIp;
    }

    const forwarded = parseForwardedFor(c.req.header('Forwarded'));
    if (forwarded) {
      return forwarded;
    }
  }

  return 'unknown-client';
}

function getRule(config: GatewayConfig, group: RateLimitGroup): { max: number; windowMs: number } {
  if (group === 'login') {
    return {
      max: config.loginRateLimitMax,
      windowMs: config.loginRateLimitWindowSeconds * 1_000,
    };
  }

  if (group === 'authenticated') {
    return {
      max: config.authenticatedRateLimitMax,
      windowMs: config.authenticatedRateLimitWindowSeconds * 1_000,
    };
  }

  return {
    max: config.rateLimitMax,
    windowMs: config.rateLimitWindowSeconds * 1_000,
  };
}

function pruneExpiredBuckets(buckets: Map<string, RateLimitBucket>, now: number): void {
  if (buckets.size < 1_000) {
    return;
  }

  for (const [key, bucket] of buckets) {
    if (bucket.resetAt <= now) {
      buckets.delete(key);
    }
  }
}

function parseForwardedFor(header: string | undefined): string | undefined {
  if (!header) {
    return undefined;
  }

  for (const part of header.split(';')) {
    const [rawKey, rawValue] = part.split('=');
    if (rawKey?.trim().toLowerCase() !== 'for' || !rawValue) {
      continue;
    }

    return rawValue.trim().replace(/^"|"$/gu, '');
  }

  return undefined;
}
