import { homedir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { getConfig, setConfig } from '../../../src/core/config.js';

describe('server config', () => {
  it('keeps metadata under ~/.llm/projects while allowing custom project roots', () => {
    const original = getConfig();
    const projectsRoot = join(homedir(), 'Custom LLM Projects');

    try {
      setConfig({ projectsRoot });

      expect(getConfig()).toEqual({
        dataRoot: join(homedir(), '.llm', 'projects'),
        projectsRoot,
      });
    } finally {
      setConfig(original);
    }
  });
});
