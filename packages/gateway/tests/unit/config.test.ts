import { describe, expect, it } from 'vitest';

import { getGatewayConfig } from '../../src/config.js';

describe('gateway config', () => {
  it('applies defaults and normalizes required values', () => {
    const config = getGatewayConfig({
      jwtSecret: 'jwt-secret',
      encryptionKey: Buffer.alloc(32, 3).toString('base64'),
      adminToken: 'admin-token',
    });

    expect(config.host).toBe('127.0.0.1');
    expect(config.port).toBe(8123);
    expect(config.dbPath.endsWith('gateway.sqlite')).toBe(true);
    expect(config.accessTtlSeconds).toBe(900);
    expect(config.refreshTtlSeconds).toBe(2_592_000);
    expect(config.corsOrigins).toEqual(['*']);
    expect(config.logMode).toBe('full');
    expect(config.encryptionKey).toHaveLength(32);
  });

  it('throws when the encryption key length is invalid', () => {
    expect(() =>
      getGatewayConfig({
        jwtSecret: 'jwt-secret',
        encryptionKey: Buffer.alloc(16).toString('base64'),
        adminToken: 'admin-token',
      })
    ).toThrow('GATEWAY_ENCRYPTION_KEY must decode to exactly 32 bytes.');
  });
});
