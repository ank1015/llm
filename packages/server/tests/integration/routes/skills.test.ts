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
    expect(body[0].name).toBe('ai-images');
    expect(mockListBundledSkills).toHaveBeenCalledTimes(1);
  });
});
