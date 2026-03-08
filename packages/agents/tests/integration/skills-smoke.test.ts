import { spawnSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageRoot = resolve(__dirname, '../..');

function findPythonCommand(): string | undefined {
  for (const command of ['python3', 'python']) {
    const result = spawnSync(command, ['--version'], { encoding: 'utf-8' });
    if (result.status === 0) {
      return command;
    }
  }

  return undefined;
}

describe('bundled skill executables', () => {
  it('shows help for the llm-use executable', () => {
    const scriptPath = join(packageRoot, 'skills', 'llm-use', 'scripts', 'complete-once.mjs');
    const result = spawnSync(process.execPath, [scriptPath, '--help'], { encoding: 'utf-8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('Usage: node .max/skills/llm-use/scripts/complete-once.mjs');
  });

  it('shows help for the browser-use executable', () => {
    const scriptPath = join(
      packageRoot,
      'skills',
      'browser-use',
      'sites',
      'google',
      'scripts',
      'get-search.mjs'
    );
    const result = spawnSync(process.execPath, [scriptPath, '--help'], { encoding: 'utf-8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(
      'Usage: node .max/skills/browser-use/sites/google/scripts/get-search.mjs'
    );
  });

  it('shows help for representative pptx and xlsx helpers', () => {
    const python = findPythonCommand();
    expect(python).toBeTruthy();

    const pptxResult = spawnSync(
      python!,
      [join(packageRoot, 'skills', 'pptx', 'scripts', 'thumbnail.py'), '--help'],
      {
        encoding: 'utf-8',
      }
    );
    expect(pptxResult.status).toBe(0);
    expect(pptxResult.stdout).toContain('Usage:');

    const xlsxResult = spawnSync(
      python!,
      [join(packageRoot, 'skills', 'xlsx', 'scripts', 'recalc.py'), '--help'],
      {
        encoding: 'utf-8',
      }
    );
    expect(xlsxResult.status).toBe(0);
    expect(xlsxResult.stdout).toContain('Usage: python .max/skills/xlsx/scripts/recalc.py');
  });
});

describe('test CLI', () => {
  it('documents the repeatable --skill flag', () => {
    const cliPath = join(packageRoot, 'src', 'test-cli.ts');
    const result = spawnSync(process.execPath, ['--import', 'tsx', cliPath, '--help'], {
      cwd: packageRoot,
      encoding: 'utf-8',
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain('--skill <name>');
  });
});
