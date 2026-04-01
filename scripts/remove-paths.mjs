import { readdir, rm } from 'node:fs/promises';
import { resolve } from 'node:path';

const arguments_ = process.argv.slice(2);
const removeTsbuildinfo = arguments_.includes('--tsbuildinfo');
const targets = arguments_.filter((argument_) => argument_ !== '--tsbuildinfo');

await Promise.all(
  targets.map(async (target) => {
    await rm(resolve(process.cwd(), target), { recursive: true, force: true });
  })
);

if (removeTsbuildinfo) {
  const entries = await readdir(process.cwd(), { withFileTypes: true });

  await Promise.all(
    entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.tsbuildinfo'))
      .map(async (entry) => {
        await rm(resolve(process.cwd(), entry.name), { force: true });
      })
  );
}
