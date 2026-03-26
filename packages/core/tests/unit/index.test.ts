import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { VERSION } from '../../src/index.js';

describe('@ank1015/llm-core', () => {
  it('exports package version', () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8')
    ) as { version: string };

    expect(VERSION).toBe(packageJson.version);
  });
});
