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
    expect(config.rateLimitEnabled).toBe(true);
    expect(config.rateLimitWindowSeconds).toBe(60);
    expect(config.rateLimitMax).toBe(60);
    expect(config.loginRateLimitWindowSeconds).toBe(600);
    expect(config.loginRateLimitMax).toBe(10);
    expect(config.authenticatedRateLimitWindowSeconds).toBe(3_600);
    expect(config.authenticatedRateLimitMax).toBe(120);
    expect(config.maxRequestBodyBytes).toBe(16 * 1024 * 1024);
    expect(config.imagePayloadLimitBytes).toBe(12 * 1024 * 1024);
    expect(config.maxImages).toBe(4);
    expect(config.trustProxy).toBe(false);
    expect(config.cookieSecure).toBe('auto');
    expect(config.encryptionKey).toHaveLength(32);
  });

  it('parses production hardening options', () => {
    const config = getGatewayConfig({
      jwtSecret: 'jwt-secret',
      encryptionKey: Buffer.alloc(32, 3).toString('base64'),
      adminToken: 'admin-token',
      rateLimitEnabled: 'false',
      rateLimitWindowSeconds: '30',
      rateLimitMax: '12',
      loginRateLimitWindowSeconds: '120',
      loginRateLimitMax: '4',
      authenticatedRateLimitWindowSeconds: '300',
      authenticatedRateLimitMax: '25',
      maxRequestBodyBytes: '1024',
      imagePayloadLimitBytes: '2048',
      maxImages: '2',
      trustProxy: 'true',
      cookieSecure: 'true',
    });

    expect(config.rateLimitEnabled).toBe(false);
    expect(config.rateLimitWindowSeconds).toBe(30);
    expect(config.rateLimitMax).toBe(12);
    expect(config.loginRateLimitWindowSeconds).toBe(120);
    expect(config.loginRateLimitMax).toBe(4);
    expect(config.authenticatedRateLimitWindowSeconds).toBe(300);
    expect(config.authenticatedRateLimitMax).toBe(25);
    expect(config.maxRequestBodyBytes).toBe(1024);
    expect(config.imagePayloadLimitBytes).toBe(2048);
    expect(config.maxImages).toBe(2);
    expect(config.trustProxy).toBe(true);
    expect(config.cookieSecure).toBe(true);
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

  it('throws when boolean hardening options are invalid', () => {
    expect(() =>
      getGatewayConfig({
        jwtSecret: 'jwt-secret',
        encryptionKey: Buffer.alloc(32, 3).toString('base64'),
        adminToken: 'admin-token',
        trustProxy: 'sometimes',
      })
    ).toThrow('GATEWAY_TRUST_PROXY must be true or false.');

    expect(() =>
      getGatewayConfig({
        jwtSecret: 'jwt-secret',
        encryptionKey: Buffer.alloc(32, 3).toString('base64'),
        adminToken: 'admin-token',
        cookieSecure: 'maybe',
      })
    ).toThrow('GATEWAY_COOKIE_SECURE must be auto, true, or false.');
  });
});
