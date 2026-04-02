import { join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  INSTALLED_SKILLS_DIR_NAME,
  MAX_DIR_NAME,
  TEMP_DIR_NAME,
  createArtifactSkillWorkspaceLayout,
} from '../../../src/skills/workspace.js';

describe('skill workspace layout', () => {
  it('creates the artifact-local .max workspace layout', () => {
    const rootDir = resolve('tmp/project-alpha/artifact-one');
    const layout = createArtifactSkillWorkspaceLayout('tmp/project-alpha/artifact-one');

    expect(layout).toEqual({
      rootDir,
      stateDir: join(rootDir, MAX_DIR_NAME),
      skillsDir: join(rootDir, MAX_DIR_NAME, INSTALLED_SKILLS_DIR_NAME),
      tempDir: join(rootDir, MAX_DIR_NAME, TEMP_DIR_NAME),
    });
  });
});
