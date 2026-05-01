import { homedir } from 'node:os';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

import { expandPath } from '../../../src/tools/path-utils.js';

describe('path utils', () => {
  it('expands POSIX-style home-relative paths', () => {
    expect(expandPath('~/Documents/report.txt')).toBe(resolve(homedir(), 'Documents/report.txt'));
  });

  it('expands Windows-style home-relative paths', () => {
    expect(expandPath('~\\Documents\\report.txt')).toBe(
      resolve(homedir(), 'Documents\\report.txt')
    );
  });
});
