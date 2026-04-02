import { listRegisteredSkills } from '@ank1015/llm-agents';
import { Hono } from 'hono';

import { toRegisteredSkillDto } from '../http/contracts.js';

import type { RegisteredSkillDto, RegisteredSkillListResponse } from '../contracts/index.js';

const BASE = '/skills';

export const skillRoutes = new Hono();

skillRoutes.get(BASE, async (c) => {
  const skills = await listRegisteredSkills();
  return c.json<RegisteredSkillListResponse>(
    skills.map((skill): RegisteredSkillDto => toRegisteredSkillDto(skill))
  );
});
