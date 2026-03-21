import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { describe, expect, it } from 'vitest';

import { isMainModule } from '../../src/utils/is-main-module.js';

describe('isMainModule', () => {
  it('treats a symlinked entry path as the main module', async () => {
    const tempDir = await mkdtemp(join(tmpdir(), 'llm-agents-main-module-'));
    const targetPath = join(tempDir, 'target.mjs');
    const symlinkPath = join(tempDir, 'link.mjs');

    try {
      await writeFile(targetPath, 'export {};\n', 'utf-8');
      await symlink(targetPath, symlinkPath);

      expect(isMainModule(pathToFileURL(targetPath).href, symlinkPath)).toBe(true);
    } finally {
      await rm(tempDir, { recursive: true, force: true });
    }
  });

  it('returns false when argv[1] is missing', () => {
    expect(isMainModule(import.meta.url, undefined)).toBe(false);
  });
});
