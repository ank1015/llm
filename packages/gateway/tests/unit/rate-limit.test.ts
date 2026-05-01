import { describe, expect, it } from 'vitest';

import { getGatewayConfig } from '../../src/config.js';
import { createInMemoryRateLimiter } from '../../src/rate-limit.js';

describe('rate limiter', () => {
  it('allows requests under the threshold and blocks after it', () => {
    let now = 1_000;
    const limiter = createInMemoryRateLimiter(
      createConfig({
        rateLimitMax: 2,
        rateLimitWindowSeconds: 60,
      }),
      () => now
    );

    expect(limiter.check({ group: 'unauthenticated', identifier: 'ip-a' }).allowed).toBe(true);
    expect(limiter.check({ group: 'unauthenticated', identifier: 'ip-a' }).allowed).toBe(true);
    expect(limiter.check({ group: 'unauthenticated', identifier: 'ip-a' }).allowed).toBe(false);

    now += 60_001;
    expect(limiter.check({ group: 'unauthenticated', identifier: 'ip-a' }).allowed).toBe(true);
  });

  it('separates counters by client and route group', () => {
    const limiter = createInMemoryRateLimiter(
      createConfig({
        loginRateLimitMax: 1,
        loginRateLimitWindowSeconds: 600,
        rateLimitMax: 1,
        rateLimitWindowSeconds: 60,
      }),
      () => 1_000
    );

    expect(limiter.check({ group: 'login', identifier: 'ip-a' }).allowed).toBe(true);
    expect(limiter.check({ group: 'login', identifier: 'ip-a' }).allowed).toBe(false);
    expect(limiter.check({ group: 'login', identifier: 'ip-b' }).allowed).toBe(true);
    expect(limiter.check({ group: 'unauthenticated', identifier: 'ip-a' }).allowed).toBe(true);
  });

  it('respects disabled rate limiting', () => {
    const limiter = createInMemoryRateLimiter(
      createConfig({
        rateLimitEnabled: false,
        rateLimitMax: 1,
      }),
      () => 1_000
    );

    expect(limiter.check({ group: 'unauthenticated', identifier: 'ip-a' }).allowed).toBe(true);
    expect(limiter.check({ group: 'unauthenticated', identifier: 'ip-a' }).allowed).toBe(true);
  });
});

function createConfig(overrides: Parameters<typeof getGatewayConfig>[0] = {}) {
  return getGatewayConfig({
    dbPath: ':memory:',
    jwtSecret: 'jwt-secret',
    encryptionKey: Buffer.alloc(32, 3).toString('base64'),
    adminToken: 'admin-token',
    ...overrides,
  });
}
