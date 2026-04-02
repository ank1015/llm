import { describe, expect, it } from 'vitest';

import { getRegisteredSkill, listRegisteredSkills } from '../../../src/skills/registry.js';

describe('skills registry', () => {
  it('loads the registered skills and parses their GitHub tree links', async () => {
    const skills = await listRegisteredSkills();

    expect(skills).toEqual([
      expect.objectContaining({
        name: 'pdf',
        link: 'https://github.com/anthropics/skills/tree/main/skills/pdf',
        description: expect.stringContaining('PDF files'),
        source: {
          owner: 'anthropics',
          repo: 'skills',
          ref: 'main',
          subpath: 'skills/pdf',
        },
      }),
    ]);
  });

  it('looks up a single registered skill by name', async () => {
    await expect(getRegisteredSkill('pdf')).resolves.toEqual(
      expect.objectContaining({ name: 'pdf' })
    );
    await expect(getRegisteredSkill('missing-skill')).resolves.toBeUndefined();
  });
});
