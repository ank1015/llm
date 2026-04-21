import { describe, expect, it } from 'vitest';

import { toSseCommentFrame, toSseDataFrame } from '../../src/sse.js';

describe('sse helpers', () => {
  it('encodes data and comment frames', () => {
    expect(new TextDecoder().decode(toSseDataFrame({ ok: true }))).toBe('data: {"ok":true}\n\n');
    expect(new TextDecoder().decode(toSseCommentFrame('keep-alive'))).toBe(': keep-alive\n\n');
  });
});
