/* global process */

import { cp, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = process.cwd();
const source = resolve(root, 'src/renderer');
const target = resolve(root, 'dist/renderer');

await mkdir(target, { recursive: true });
await cp(source, target, { recursive: true });
