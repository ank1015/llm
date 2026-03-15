import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '../..');

describe('server skill regressions', () => {
  it('removes retired skill bootstrap and prompt plumbing from the server package', async () => {
    const patterns = [
      ['setup', 'Skills'].join(''),
      ['set', 'UpSkills'].join(''),
      ['max', '-skills'].join(''),
      ['global', 'Skills'].join(''),
      ['resolve', 'Skills'].join(''),
    ];
    const filesToCheck = [join(packageRoot, 'src'), join(packageRoot, 'tests')];
    const violations: string[] = [];

    async function scanPath(path: string): Promise<void> {
      const pathStat = await stat(path);
      if (pathStat.isDirectory()) {
        const entries = await readdir(path, { withFileTypes: true });
        for (const entry of entries) {
          if (entry.name === 'dist' || entry.name === 'node_modules') {
            continue;
          }
          await scanPath(join(path, entry.name));
        }
        return;
      }

      if (!path.endsWith('.ts') && !path.endsWith('.md')) {
        return;
      }

      const content = await readFile(path, 'utf-8');
      if (patterns.some((pattern) => content.includes(pattern))) {
        violations.push(path);
      }
    }

    for (const path of filesToCheck) {
      await scanPath(path);
    }

    expect(violations).toEqual([]);
  });
});
