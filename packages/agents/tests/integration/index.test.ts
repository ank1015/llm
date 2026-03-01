import { describe, expect, it } from 'vitest';

import { VERSION } from '../../src/index.js';

describe('@ank1015/llm-agents integration', () => {
  it('resolves package exports', () => {
    expect(VERSION).toMatch(/^\d+\.\d+\.\d+$/);
  });
});
