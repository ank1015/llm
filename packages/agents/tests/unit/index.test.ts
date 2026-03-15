import { describe, expect, it } from 'vitest';

import { VERSION } from '../../src/index.js';

describe('@ank1015/llm-agents', () => {
  it('exports package version', () => {
    expect(VERSION).toBe('0.0.2');
  });
});
