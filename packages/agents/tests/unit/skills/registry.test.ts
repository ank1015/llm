import { describe, expect, it } from 'vitest';

import { getRegisteredSkill, listRegisteredSkills } from '../../../src/skills/registry.js';

describe('skills registry', () => {
  it('loads the registered skills and parses their GitHub tree links', async () => {
    const skills = await listRegisteredSkills();

    expect(skills).toEqual([
      expect.objectContaining({
        name: 'chrome-controller',
        link: 'https://github.com/ank1015/chrome-controller/tree/main/skill/chrome-controller',
        description: expect.stringContaining('Control Chrome'),
        source: {
          owner: 'ank1015',
          repo: 'chrome-controller',
          ref: 'main',
          subpath: 'skill/chrome-controller',
        },
      }),
      expect.objectContaining({
        name: 'docx',
        link: 'https://github.com/anthropics/skills/tree/main/skills/docx',
        description: expect.stringContaining('Word documents'),
        source: {
          owner: 'anthropics',
          repo: 'skills',
          ref: 'main',
          subpath: 'skills/docx',
        },
      }),
      expect.objectContaining({
        name: 'llm',
        link: 'https://github.com/ank1015/llm/tree/main/packages/sdk/skills/llm-sdk',
        description: expect.stringContaining('@ank1015/llm-sdk'),
        source: {
          owner: 'ank1015',
          repo: 'llm',
          ref: 'main',
          subpath: 'packages/sdk/skills/llm-sdk',
        },
      }),
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
      expect.objectContaining({
        name: 'pptx',
        link: 'https://github.com/anthropics/skills/tree/main/skills/pptx',
        description: expect.stringContaining('.pptx file'),
        source: {
          owner: 'anthropics',
          repo: 'skills',
          ref: 'main',
          subpath: 'skills/pptx',
        },
      }),
      expect.objectContaining({
        name: 'xlsx',
        link: 'https://github.com/anthropics/skills/tree/main/skills/xlsx',
        description: expect.stringContaining('spreadsheet file'),
        source: {
          owner: 'anthropics',
          repo: 'skills',
          ref: 'main',
          subpath: 'skills/xlsx',
        },
      }),
    ]);
  });

  it('looks up a single registered skill by name', async () => {
    await expect(getRegisteredSkill('chrome-controller')).resolves.toEqual(
      expect.objectContaining({ name: 'chrome-controller' })
    );
    await expect(getRegisteredSkill('docx')).resolves.toEqual(
      expect.objectContaining({ name: 'docx' })
    );
    await expect(getRegisteredSkill('llm')).resolves.toEqual(
      expect.objectContaining({ name: 'llm' })
    );
    await expect(getRegisteredSkill('pdf')).resolves.toEqual(
      expect.objectContaining({ name: 'pdf' })
    );
    await expect(getRegisteredSkill('pptx')).resolves.toEqual(
      expect.objectContaining({ name: 'pptx' })
    );
    await expect(getRegisteredSkill('xlsx')).resolves.toEqual(
      expect.objectContaining({ name: 'xlsx' })
    );
    await expect(getRegisteredSkill('missing-skill')).resolves.toBeUndefined();
  });
});
