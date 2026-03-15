import { Hono } from 'hono';

import { listBundledAgentSkills } from '../core/index.js';
import { toBundledSkillDto } from '../http/contracts.js';

import type { BundledSkillDto } from '@ank1015/llm-app-contracts';

export const skillRoutes = new Hono();

/** GET /api/skills — List bundled installable skills */
skillRoutes.get('/skills', async (c) => {
  try {
    const skills = await listBundledAgentSkills();
    return c.json<BundledSkillDto[]>(skills.map(toBundledSkillDto));
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list bundled skills';
    return c.json({ error: message }, 500);
  }
});
