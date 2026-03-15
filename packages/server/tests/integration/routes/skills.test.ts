import { BundledSkillDtoSchema } from '@ank1015/llm-app-contracts';
import { Value } from '@sinclair/typebox/value';
import { describe, it, expect, beforeEach } from 'vitest';

import { mockListBundledSkills, resetAgentMocks } from '../../helpers/mock-agents.js';

const { app } = await import('../../../src/index.js');

describe('Skill Routes', () => {
  beforeEach(() => {
    resetAgentMocks();
  });

  it('should list bundled installable skills', async () => {
    const res = await app.request('/api/skills');

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(Value.Check(BundledSkillDtoSchema, body[0])).toBe(true);
    expect(body[0].name).toBe('ai-images');
    expect(body[0]).not.toHaveProperty('path');
    expect(body[0]).not.toHaveProperty('directory');
    expect(mockListBundledSkills).toHaveBeenCalledTimes(1);
  });
});
