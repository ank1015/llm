import { describe, expect, it } from 'vitest';

import { sanitizeForStorage, sanitizeProviderOptions } from '../../src/logging/sanitize.js';

describe('sanitization', () => {
  it('strips forbidden provider option fields', () => {
    const sanitized = sanitizeProviderOptions({
      apiKey: 'should-not-pass',
      headers: { Authorization: 'Bearer token' },
      reasoning: {
        effort: 'high',
      },
    });

    expect(sanitized).toEqual({
      reasoning: {
        effort: 'high',
      },
    });
  });

  it('redacts secrets and raw base64 payloads from stored logs', () => {
    const sanitized = sanitizeForStorage({
      accessToken: 'token',
      content: [
        {
          type: 'image',
          data: Buffer.from('image-bytes').toString('base64'),
          mimeType: 'image/png',
        },
      ],
    }) as {
      accessToken: string;
      content: Array<{
        data: {
          byteLength: number;
          redacted: boolean;
          sha256: string;
        };
      }>;
    };

    expect(sanitized.accessToken).toBe('[REDACTED]');
    expect(sanitized.content[0]?.data.redacted).toBe(true);
    expect(sanitized.content[0]?.data.byteLength).toBeGreaterThan(0);
    expect(typeof sanitized.content[0]?.data.sha256).toBe('string');
  });
});
