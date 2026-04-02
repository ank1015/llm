import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export async function createGitHubSkillArchive(options?: {
  repoRootName?: string;
  files?: Record<string, string>;
}): Promise<Uint8Array> {
  const workspaceRoot = await mkdtemp(join(tmpdir(), 'llm-server-skill-archive-'));
  const repoRootName = options?.repoRootName ?? `anthropics-skills-${randomUUID()}`;
  const repoRootDir = join(workspaceRoot, repoRootName);
  const archivePath = join(workspaceRoot, 'skill.tar.gz');
  const files = options?.files ?? {
    'skills/pdf/SKILL.md': '# PDF skill\n',
    'skills/pdf/reference.md': 'reference',
    'skills/pdf/scripts/extract.ts': 'console.log("extract")\n',
  };

  try {
    await mkdir(repoRootDir, { recursive: true });

    for (const [relativePath, content] of Object.entries(files)) {
      const absolutePath = join(repoRootDir, relativePath);
      await mkdir(dirname(absolutePath), { recursive: true });
      await writeFile(absolutePath, content, 'utf8');
    }

    await execFileAsync('tar', ['czf', archivePath, '-C', workspaceRoot, repoRootName], {
      encoding: 'utf8',
    });

    return new Uint8Array(await readFile(archivePath));
  } finally {
    await rm(workspaceRoot, { recursive: true, force: true });
  }
}

export function createFetchResponse(bytes: Uint8Array, status = 200): Response {
  return new Response(bytes, {
    status,
    headers: {
      'Content-Type': 'application/gzip',
    },
  });
}
