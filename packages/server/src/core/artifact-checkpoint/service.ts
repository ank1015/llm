import { execFile } from 'node:child_process';
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { createAllTools, createCheckpointSummaryPrompt } from '@ank1015/llm-agents';
import { agent, getText, userMessage } from '@ank1015/llm-sdk';

import { ArtifactDir } from '../artifact-dir/artifact-dir.js';
import { Project } from '../project/project.js';
import { ensureDir, pathExists, readJson, writeJson } from '../storage/fs.js';

import type { AgentTool } from '@ank1015/llm-core';
import type { CuratedModelId } from '@ank1015/llm-sdk';
import type {
  ArtifactCheckpoint,
  ArtifactCheckpointDiffChangeType,
  ArtifactCheckpointDiffFile,
  ArtifactCheckpointDiffResult,
  ArtifactCheckpointListResult,
  ArtifactCheckpointMetadata,
  ArtifactCheckpointRollbackResult,
  CheckpointSummaryStatus,
} from '../../types/index.js';

const execFileAsync = promisify(execFile);

const CHECKPOINT_AUTHOR_NAME = 'LLM Stack';
const CHECKPOINT_AUTHOR_EMAIL = 'checkpoint@llm-stack.local';
const CHECKPOINT_SUMMARY_MODEL_ID = 'google/gemini-3-flash-preview' as const;
const CHECKPOINT_DIRECTORY_NAME = 'checkpoints';
const CHECKPOINT_SUMMARY_SESSIONS_DIRECTORY_NAME = 'checkpoint-summaries';
const CHECKPOINT_COMMIT_SUBJECT_PREFIX = 'checkpoint:';
const MAX_DIFF_TEXT_BYTES = 200_000;
const EXCLUDED_GIT_CLEAN_PATTERNS = ['.max/temp/', '.max/skills/'] as const;
const EXCLUDED_PATH_SPECS = [
  ':(exclude).max/temp',
  ':(exclude).max/temp/**',
  ':(exclude).max/skills',
  ':(exclude).max/skills/**',
] as const;

type GitCommitRecord = {
  commitHash: string;
  shortHash: string;
  createdAt: string;
  subject: string;
  body: string | null;
};

type SummaryPayload = {
  title: string;
  description: string;
};

type WorkingTreeStatusEntry = {
  path: string;
  previousPath: string | null;
  changeType: ArtifactCheckpointDiffChangeType;
  currentContentPath: string | null;
  headContentPath: string | null;
};

type DiffTextSnapshot = {
  isBinary: boolean;
  text: string | null;
  textTruncated: boolean;
};

type ArtifactCheckpointServiceOptions = {
  runAgent?: typeof agent;
  summaryModelId?: CuratedModelId;
  createSummaryPrompt?: typeof createCheckpointSummaryPrompt;
};

export class ArtifactCheckpointNoChangesError extends Error {
  constructor() {
    super('No changes to checkpoint');
    this.name = 'ArtifactCheckpointNoChangesError';
  }
}

export class ArtifactCheckpointRepositoryMissingError extends Error {
  constructor() {
    super('Artifact checkpoint repository not initialized');
    this.name = 'ArtifactCheckpointRepositoryMissingError';
  }
}

export class ArtifactCheckpointHeadMissingError extends Error {
  constructor() {
    super('Artifact checkpoint HEAD is missing');
    this.name = 'ArtifactCheckpointHeadMissingError';
  }
}

export class ArtifactCheckpointConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArtifactCheckpointConflictError';
  }
}

export class ArtifactCheckpointService {
  private readonly mutationLocks = new Map<string, Promise<void>>();
  private readonly backgroundTasks = new Set<Promise<void>>();
  private readonly runAgent;
  private readonly summaryModelId;
  private readonly createSummaryPrompt;

  constructor(options: ArtifactCheckpointServiceOptions = {}) {
    this.runAgent = options.runAgent ?? agent;
    this.summaryModelId = options.summaryModelId ?? CHECKPOINT_SUMMARY_MODEL_ID;
    this.createSummaryPrompt = options.createSummaryPrompt ?? createCheckpointSummaryPrompt;
  }

  async createCheckpoint(projectId: string, artifactDirId: string): Promise<ArtifactCheckpoint> {
    const lockKey = getArtifactKey(projectId, artifactDirId);
    return this.withArtifactLock(lockKey, async () => {
      const artifactDir = await ArtifactDir.getById(projectId, artifactDirId);

      await this.ensureGitRepository(artifactDir.dirPath);
      await this.stageCheckpointableChanges(artifactDir.dirPath);

      if (!(await this.isArtifactDirty(artifactDir.dirPath))) {
        throw new ArtifactCheckpointNoChangesError();
      }

      const createdAt = new Date().toISOString();
      const commitSubject = `${CHECKPOINT_COMMIT_SUBJECT_PREFIX} ${createdAt}`;
      await this.runGit(
        artifactDir.dirPath,
        ['commit', '--quiet', '-m', commitSubject],
        withGitAuthorEnv(createdAt)
      );

      const commitHash = await this.getHeadCommitHash(artifactDir.dirPath);
      if (!commitHash) {
        throw new ArtifactCheckpointHeadMissingError();
      }

      const metadata: ArtifactCheckpointMetadata = {
        commitHash,
        createdAt,
        summaryStatus: 'pending',
        title: null,
        description: null,
      };
      await this.writeCheckpointMetadata(artifactDir.dataPath, metadata);

      this.trackBackgroundTask(this.generateCheckpointSummary(projectId, artifactDirId, commitHash));

      return {
        commitHash,
        shortHash: toShortHash(commitHash),
        createdAt,
        summaryStatus: 'pending',
        title: null,
        description: null,
        isHead: true,
      };
    });
  }

  async listCheckpoints(
    projectId: string,
    artifactDirId: string
  ): Promise<ArtifactCheckpointListResult> {
    const artifactDir = await ArtifactDir.getById(projectId, artifactDirId);
    const hasRepository = await this.hasGitRepository(artifactDir.dirPath);
    if (!hasRepository) {
      return {
        hasRepository: false,
        dirty: false,
        headCommitHash: null,
        checkpoints: [],
      };
    }

    const [dirty, headCommitHash, metadataMap, commits] = await Promise.all([
      this.isArtifactDirty(artifactDir.dirPath),
      this.getHeadCommitHash(artifactDir.dirPath),
      this.readCheckpointMetadataMap(artifactDir.dataPath),
      this.readGitCommitHistory(artifactDir.dirPath),
    ]);

    return {
      hasRepository: true,
      dirty,
      headCommitHash,
      checkpoints: commits.map((commit) => {
        const metadata = metadataMap.get(commit.commitHash);
        const summaryStatus: CheckpointSummaryStatus = metadata?.summaryStatus ?? 'unavailable';

        return {
          commitHash: commit.commitHash,
          shortHash: commit.shortHash,
          createdAt: metadata?.createdAt ?? commit.createdAt,
          summaryStatus,
          title: metadata?.title ?? commit.subject,
          description: metadata?.description ?? commit.body,
          isHead: commit.commitHash === headCommitHash,
        };
      }),
    };
  }

  async rollbackToHead(
    projectId: string,
    artifactDirId: string
  ): Promise<ArtifactCheckpointRollbackResult> {
    const lockKey = getArtifactKey(projectId, artifactDirId);
    return this.withArtifactLock(lockKey, async () => {
      const artifactDir = await ArtifactDir.getById(projectId, artifactDirId);
      if (!(await this.hasGitRepository(artifactDir.dirPath))) {
        throw new ArtifactCheckpointRepositoryMissingError();
      }

      const headCommitHash = await this.getHeadCommitHash(artifactDir.dirPath);
      if (!headCommitHash) {
        throw new ArtifactCheckpointHeadMissingError();
      }

      const dirty = await this.isArtifactDirty(artifactDir.dirPath);
      if (!dirty) {
        return {
          ok: true,
          reverted: false,
          headCommitHash,
        };
      }

      await this.runGit(artifactDir.dirPath, ['reset', '--hard', 'HEAD']);
      await this.runGit(artifactDir.dirPath, [
        'clean',
        '-fdx',
        ...EXCLUDED_GIT_CLEAN_PATTERNS.flatMap((pattern) => ['-e', pattern]),
      ]);

      return {
        ok: true,
        reverted: true,
        headCommitHash,
      };
    });
  }

  async getDiff(projectId: string, artifactDirId: string): Promise<ArtifactCheckpointDiffResult> {
    const artifactDir = await ArtifactDir.getById(projectId, artifactDirId);
    const hasRepository = await this.hasGitRepository(artifactDir.dirPath);
    const headCommitHash = hasRepository ? await this.getHeadCommitHash(artifactDir.dirPath) : null;

    if (!headCommitHash) {
      const files = await this.readInitialDiffFiles(artifactDir.dirPath);
      return {
        hasRepository,
        headCommitHash: null,
        dirty: files.length > 0,
        files,
      };
    }

    const entries = await this.readWorkingTreeStatusEntries(artifactDir.dirPath);
    if (entries.length === 0) {
      return {
        hasRepository: true,
        headCommitHash,
        dirty: false,
        files: [],
      };
    }

    const files = await Promise.all(
      entries.map((entry) => this.buildDiffFile(artifactDir.dirPath, entry))
    );

    return {
      hasRepository: true,
      headCommitHash,
      dirty: true,
      files,
    };
  }

  async waitForBackgroundTasks(): Promise<void> {
    await Promise.allSettled([...this.backgroundTasks]);
  }

  private async withArtifactLock<T>(lockKey: string, callback: () => Promise<T>): Promise<T> {
    const currentTail = this.mutationLocks.get(lockKey) ?? Promise.resolve();
    const nextRun = currentTail.catch(() => undefined).then(callback);
    const nextTail = nextRun.then(() => undefined, () => undefined);
    this.mutationLocks.set(lockKey, nextTail);

    try {
      return await nextRun;
    } finally {
      if (this.mutationLocks.get(lockKey) === nextTail) {
        this.mutationLocks.delete(lockKey);
      }
    }
  }

  private trackBackgroundTask(task: Promise<void>): void {
    this.backgroundTasks.add(task);
    void task.finally(() => {
      this.backgroundTasks.delete(task);
    });
  }

  private async hasGitRepository(artifactDir: string): Promise<boolean> {
    return pathExists(join(artifactDir, '.git'));
  }

  private async ensureGitRepository(artifactDir: string): Promise<void> {
    if (!(await this.hasGitRepository(artifactDir))) {
      await this.runGit(artifactDir, ['init', '--initial-branch=main']);
    }

    await this.runGit(artifactDir, ['config', 'user.name', CHECKPOINT_AUTHOR_NAME]);
    await this.runGit(artifactDir, ['config', 'user.email', CHECKPOINT_AUTHOR_EMAIL]);
    await this.ensureGitInfoExcludeFile(artifactDir);
  }

  private async ensureGitInfoExcludeFile(artifactDir: string): Promise<void> {
    const excludePath = join(artifactDir, '.git', 'info', 'exclude');
    const existing = (await pathExists(excludePath)) ? await readFile(excludePath, 'utf8') : '';
    const existingPatterns = new Set(
      existing
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0)
    );
    const missingPatterns = EXCLUDED_GIT_CLEAN_PATTERNS.filter((pattern) => {
      return !existingPatterns.has(pattern);
    });

    if (missingPatterns.length === 0) {
      return;
    }

    const prefix = existing.length === 0 || existing.endsWith('\n') ? existing : `${existing}\n`;
    await ensureDir(join(artifactDir, '.git', 'info'));
    await writeFile(excludePath, `${prefix}${missingPatterns.join('\n')}\n`, 'utf8');
  }

  private async stageCheckpointableChanges(artifactDir: string): Promise<void> {
    await this.runGit(artifactDir, ['add', '--all', '--force', '--', '.', ...EXCLUDED_PATH_SPECS]);
  }

  private async isArtifactDirty(artifactDir: string): Promise<boolean> {
    const output = await this.runGit(artifactDir, [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--ignored=matching',
    ]);

    return output
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0)
      .some((line) => !shouldIgnoreCheckpointStatusLine(line));
  }

  private async getHeadCommitHash(artifactDir: string): Promise<string | null> {
    try {
      const output = await this.runGit(artifactDir, ['rev-parse', 'HEAD']);
      const commitHash = output.trim();
      return commitHash.length > 0 ? commitHash : null;
    } catch {
      return null;
    }
  }

  private async readWorkingTreeStatusEntries(artifactDir: string): Promise<WorkingTreeStatusEntry[]> {
    const output = await this.runGit(artifactDir, [
      'status',
      '--porcelain=v1',
      '--untracked-files=all',
      '--ignored=matching',
    ]);

    return output
      .split('\n')
      .map((line) => line.trimEnd())
      .filter((line) => line.length > 0 && !shouldIgnoreCheckpointStatusLine(line))
      .map((line) => parseWorkingTreeStatusLine(line))
      .filter((entry): entry is WorkingTreeStatusEntry => entry !== null)
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  private async readInitialDiffFiles(artifactDir: string): Promise<ArtifactCheckpointDiffFile[]> {
    const relativePaths = await this.listCheckpointableFiles(artifactDir);
    const files = await Promise.all(
      relativePaths.map(async (relativePath) => {
        const afterSnapshot = await this.readWorkingFileSnapshot(join(artifactDir, relativePath));
        return toArtifactCheckpointDiffFile({
          path: relativePath,
          previousPath: null,
          changeType: 'added',
          beforeSnapshot: EMPTY_TEXT_SNAPSHOT,
          afterSnapshot,
        });
      })
    );

    return files.sort((left, right) => left.path.localeCompare(right.path));
  }

  private async listCheckpointableFiles(artifactDir: string, relativeDir = ''): Promise<string[]> {
    const absoluteDir = relativeDir ? join(artifactDir, relativeDir) : artifactDir;
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    const files: string[] = [];

    for (const entry of entries) {
      const relativePath = relativeDir ? `${relativeDir}/${entry.name}` : entry.name;
      if (isExcludedCheckpointTreePath(relativePath)) {
        continue;
      }

      if (entry.isDirectory()) {
        files.push(...(await this.listCheckpointableFiles(artifactDir, relativePath)));
        continue;
      }

      if (entry.isFile()) {
        files.push(relativePath);
      }
    }

    return files;
  }

  private async buildDiffFile(
    artifactDir: string,
    entry: WorkingTreeStatusEntry
  ): Promise<ArtifactCheckpointDiffFile> {
    const [beforeSnapshot, afterSnapshot] = await Promise.all([
      entry.headContentPath
        ? this.readHeadFileSnapshot(artifactDir, entry.headContentPath)
        : Promise.resolve(EMPTY_TEXT_SNAPSHOT),
      entry.currentContentPath
        ? this.readWorkingFileSnapshot(join(artifactDir, entry.currentContentPath))
        : Promise.resolve(EMPTY_TEXT_SNAPSHOT),
    ]);

    return toArtifactCheckpointDiffFile({
      path: entry.path,
      previousPath: entry.previousPath,
      changeType: entry.changeType,
      beforeSnapshot,
      afterSnapshot,
    });
  }

  private async readWorkingFileSnapshot(filePath: string): Promise<DiffTextSnapshot> {
    const buffer = await readFile(filePath);
    return toDiffTextSnapshot(buffer);
  }

  private async readHeadFileSnapshot(
    artifactDir: string,
    relativePath: string
  ): Promise<DiffTextSnapshot> {
    try {
      const buffer = await this.runGitBuffer(artifactDir, ['show', `HEAD:${relativePath}`]);
      return toDiffTextSnapshot(buffer);
    } catch {
      return EMPTY_TEXT_SNAPSHOT;
    }
  }

  private async readGitCommitHistory(artifactDir: string): Promise<GitCommitRecord[]> {
    const headCommitHash = await this.getHeadCommitHash(artifactDir);
    if (!headCommitHash) {
      return [];
    }

    const output = await this.runGit(artifactDir, [
      'log',
      '--format=%H%x1f%h%x1f%cI%x1f%s%x1f%b%x1e',
    ]);

    return output
      .split('\x1e')
      .map((chunk) => chunk.trim())
      .filter((chunk) => chunk.length > 0)
      .map((chunk) => {
        const [commitHash, shortHash, createdAt, subject, body] = chunk.split('\x1f');
        return {
          commitHash: commitHash ?? '',
          shortHash: shortHash ?? '',
          createdAt: createdAt ?? new Date(0).toISOString(),
          subject: normalizeNullableString(subject) ?? '',
          body: normalizeNullableString(body),
        };
      })
      .filter((commit) => commit.commitHash.length > 0);
  }

  private async readCheckpointMetadataMap(
    artifactDataPath: string
  ): Promise<Map<string, ArtifactCheckpointMetadata>> {
    const metadataDir = this.getCheckpointMetadataDir(artifactDataPath);
    if (!(await pathExists(metadataDir))) {
      return new Map();
    }

    const entries = await readdir(metadataDir, { withFileTypes: true });
    const metadataEntries = await Promise.all(
      entries
        .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
        .map(async (entry) => {
          try {
            return await readJson<ArtifactCheckpointMetadata>(join(metadataDir, entry.name));
          } catch {
            return null;
          }
        })
    );

    return new Map(
      metadataEntries
        .filter((entry): entry is ArtifactCheckpointMetadata => entry !== null)
        .map((entry) => [entry.commitHash, entry])
    );
  }

  private async writeCheckpointMetadata(
    artifactDataPath: string,
    metadata: ArtifactCheckpointMetadata
  ): Promise<void> {
    const metadataDir = this.getCheckpointMetadataDir(artifactDataPath);
    await ensureDir(metadataDir);
    await writeJson(join(metadataDir, `${metadata.commitHash}.json`), metadata);
  }

  private getCheckpointMetadataDir(artifactDataPath: string): string {
    return join(artifactDataPath, CHECKPOINT_DIRECTORY_NAME);
  }

  private getCheckpointSummarySessionPath(artifactDataPath: string, commitHash: string): string {
    return join(
      artifactDataPath,
      CHECKPOINT_SUMMARY_SESSIONS_DIRECTORY_NAME,
      `${commitHash}.jsonl`
    );
  }

  private async generateCheckpointSummary(
    projectId: string,
    artifactDirId: string,
    commitHash: string
  ): Promise<void> {
    const [project, artifactDir] = await Promise.all([
      Project.getById(projectId),
      ArtifactDir.getById(projectId, artifactDirId),
    ]);
    const [projectMetadata, artifactMetadata, currentMetadata] = await Promise.all([
      project.getMetadata(),
      artifactDir.getMetadata(),
      this.readCheckpointMetadata(artifactDir.dataPath, commitHash),
    ]);

    if (!currentMetadata || currentMetadata.summaryStatus !== 'pending') {
      return;
    }

    const summaryStartedAt = new Date().toISOString();
    const pendingMetadata: ArtifactCheckpointMetadata = {
      ...currentMetadata,
      summaryStartedAt,
    };
    await this.writeCheckpointMetadata(artifactDir.dataPath, pendingMetadata);

    try {
      const run = this.runAgent({
        modelId: this.summaryModelId,
        system: this.createSummaryPrompt({
          projectName: projectMetadata.name,
          projectDir: project.projectPath,
          artifactName: artifactMetadata.name,
          artifactDir: artifactDir.dirPath,
        }),
        inputMessages: [
          userMessage(
            `Summarize artifact checkpoint ${commitHash}. Inspect the saved commit with git commands and return strict JSON only in the shape {"title":"...","description":"..."}.`
          ),
        ],
        tools: Object.values(createAllTools(artifactDir.dirPath)) as unknown as AgentTool[],
        session: {
          path: this.getCheckpointSummarySessionPath(artifactDir.dataPath, commitHash),
        },
      });

      const result = await run;
      if (!result.ok) {
        throw new Error(result.error.message);
      }

      const finalText = getText(result.finalAssistantMessage).trim();
      const summary = parseCheckpointSummaryPayload(finalText);
      const summaryFinishedAt = new Date().toISOString();
      const { summaryError: _ignoredSummaryError, ...metadataWithoutError } = pendingMetadata;

      await this.writeCheckpointMetadata(artifactDir.dataPath, {
        ...metadataWithoutError,
        summaryStatus: 'ready',
        title: summary.title,
        description: summary.description,
        summaryStartedAt,
        summaryFinishedAt,
      });
    } catch (error) {
      const summaryFinishedAt = new Date().toISOString();

      await this.writeCheckpointMetadata(artifactDir.dataPath, {
        ...pendingMetadata,
        summaryStatus: 'failed',
        summaryStartedAt,
        summaryFinishedAt,
        summaryError: error instanceof Error ? error.message : 'Checkpoint summary failed',
      });
    }
  }

  private async readCheckpointMetadata(
    artifactDataPath: string,
    commitHash: string
  ): Promise<ArtifactCheckpointMetadata | null> {
    const metadataPath = join(this.getCheckpointMetadataDir(artifactDataPath), `${commitHash}.json`);
    if (!(await pathExists(metadataPath))) {
      return null;
    }

    return readJson<ArtifactCheckpointMetadata>(metadataPath);
  }

  private async runGit(
    cwd: string,
    args: string[],
    envOverrides?: NodeJS.ProcessEnv
  ): Promise<string> {
    try {
      const result = await execFileAsync('git', args, {
        cwd,
        env: envOverrides ? { ...process.env, ...envOverrides } : process.env,
        maxBuffer: 10 * 1024 * 1024,
      });

      return `${result.stdout ?? ''}`.trimEnd();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'git command failed';
      const stderr =
        typeof error === 'object' &&
        error !== null &&
        'stderr' in error &&
        typeof error.stderr === 'string'
          ? error.stderr.trim()
          : '';

      throw new Error(stderr ? `${message}: ${stderr}` : message);
    }
  }

  private async runGitBuffer(
    cwd: string,
    args: string[],
    envOverrides?: NodeJS.ProcessEnv
  ): Promise<Buffer> {
    try {
      const result = await execFileAsync('git', args, {
        cwd,
        env: envOverrides ? { ...process.env, ...envOverrides } : process.env,
        encoding: 'buffer',
        maxBuffer: 10 * 1024 * 1024,
      });

      return Buffer.isBuffer(result.stdout) ? result.stdout : Buffer.from(result.stdout ?? '');
    } catch (error) {
      const message = error instanceof Error ? error.message : 'git command failed';
      const stderr =
        typeof error === 'object' &&
        error !== null &&
        'stderr' in error &&
        (typeof error.stderr === 'string' || Buffer.isBuffer(error.stderr))
          ? Buffer.isBuffer(error.stderr)
            ? error.stderr.toString('utf8').trim()
            : error.stderr.trim()
          : '';

      throw new Error(stderr ? `${message}: ${stderr}` : message);
    }
  }
}

export const artifactCheckpointService = new ArtifactCheckpointService();

function getArtifactKey(projectId: string, artifactDirId: string): string {
  return `${projectId}:${artifactDirId}`;
}

function toShortHash(commitHash: string): string {
  return commitHash.slice(0, 7);
}

function withGitAuthorEnv(createdAt: string): NodeJS.ProcessEnv {
  return {
    GIT_AUTHOR_NAME: CHECKPOINT_AUTHOR_NAME,
    GIT_AUTHOR_EMAIL: CHECKPOINT_AUTHOR_EMAIL,
    GIT_AUTHOR_DATE: createdAt,
    GIT_COMMITTER_NAME: CHECKPOINT_AUTHOR_NAME,
    GIT_COMMITTER_EMAIL: CHECKPOINT_AUTHOR_EMAIL,
    GIT_COMMITTER_DATE: createdAt,
  };
}

function normalizeNullableString(value: string | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function shouldIgnoreCheckpointStatusLine(line: string): boolean {
  if (line.length <= 3) {
    return false;
  }

  const pathPart = line.slice(3).trim();
  if (pathPart.length === 0) {
    return false;
  }

  const candidatePaths = pathPart
    .split(' -> ')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);

  return (
    candidatePaths.length > 0 &&
    candidatePaths.every((candidatePath) => isExcludedCheckpointTreePath(candidatePath))
  );
}

function isExcludedCheckpointPath(relativePath: string): boolean {
  return (
    relativePath === '.max/temp' ||
    relativePath.startsWith('.max/temp/') ||
    relativePath === '.max/skills' ||
    relativePath.startsWith('.max/skills/')
  );
}

function isExcludedCheckpointTreePath(relativePath: string): boolean {
  return (
    relativePath === '.git' ||
    relativePath.startsWith('.git/') ||
    isExcludedCheckpointPath(relativePath)
  );
}

function parseWorkingTreeStatusLine(line: string): WorkingTreeStatusEntry | null {
  if (line.length <= 3) {
    return null;
  }

  const status = line.slice(0, 2);
  const pathPart = line.slice(3).trim();
  if (pathPart.length === 0) {
    return null;
  }

  const isRename = (status.includes('R') || status.includes('C')) && pathPart.includes(' -> ');
  if (isRename) {
    const [previousPathRaw, nextPathRaw] = pathPart.split(' -> ');
    const previousPath = previousPathRaw?.trim() ?? '';
    const path = nextPathRaw?.trim() ?? '';
    if (!previousPath || !path) {
      return null;
    }

    return {
      path,
      previousPath,
      changeType: 'renamed',
      currentContentPath: path,
      headContentPath: previousPath,
    };
  }

  const path = pathPart;
  if (status === '??' || status === '!!' || status.includes('A')) {
    return {
      path,
      previousPath: null,
      changeType: 'added',
      currentContentPath: path,
      headContentPath: null,
    };
  }

  if (status.includes('D')) {
    return {
      path,
      previousPath: null,
      changeType: 'deleted',
      currentContentPath: null,
      headContentPath: path,
    };
  }

  return {
    path,
    previousPath: null,
    changeType: 'modified',
    currentContentPath: path,
    headContentPath: path,
  };
}

function toArtifactCheckpointDiffFile(input: {
  path: string;
  previousPath: string | null;
  changeType: ArtifactCheckpointDiffChangeType;
  beforeSnapshot: DiffTextSnapshot;
  afterSnapshot: DiffTextSnapshot;
}): ArtifactCheckpointDiffFile {
  const isBinary = input.beforeSnapshot.isBinary || input.afterSnapshot.isBinary;
  return {
    path: input.path,
    previousPath: input.previousPath,
    changeType: input.changeType,
    isBinary,
    beforeText: isBinary ? null : (input.beforeSnapshot.text ?? ''),
    afterText: isBinary ? null : (input.afterSnapshot.text ?? ''),
    textTruncated: input.beforeSnapshot.textTruncated || input.afterSnapshot.textTruncated,
  };
}

function toDiffTextSnapshot(buffer: Buffer): DiffTextSnapshot {
  if (isLikelyBinaryBuffer(buffer)) {
    return {
      isBinary: true,
      text: null,
      textTruncated: false,
    };
  }

  const textTruncated = buffer.length > MAX_DIFF_TEXT_BYTES;
  const safeBuffer = textTruncated ? buffer.subarray(0, MAX_DIFF_TEXT_BYTES) : buffer;

  return {
    isBinary: false,
    text: safeBuffer.toString('utf8'),
    textTruncated,
  };
}

function isLikelyBinaryBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) {
    return false;
  }

  const sample = buffer.subarray(0, Math.min(buffer.length, 8_000));
  if (sample.includes(0)) {
    return true;
  }

  let suspiciousByteCount = 0;
  for (const byte of sample) {
    const isCommonWhitespace = byte === 9 || byte === 10 || byte === 13;
    const isPrintableAscii = byte >= 32 && byte <= 126;
    const isExtendedText = byte >= 128;

    if (!isCommonWhitespace && !isPrintableAscii && !isExtendedText) {
      suspiciousByteCount += 1;
    }
  }

  return suspiciousByteCount / sample.length > 0.3;
}

const EMPTY_TEXT_SNAPSHOT: DiffTextSnapshot = {
  isBinary: false,
  text: '',
  textTruncated: false,
};

function parseCheckpointSummaryPayload(raw: string): SummaryPayload {
  const parsed = JSON.parse(raw) as Partial<SummaryPayload>;
  const title = normalizeSummaryTitle(parsed.title);
  const description = normalizeSummaryDescription(parsed.description);

  return {
    title,
    description,
  };
}

function normalizeSummaryTitle(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Checkpoint summary title must be a string');
  }

  const title = value.trim().replace(/\s+/gu, ' ');
  const words = title.split(' ').filter((word) => word.length > 0);

  if (title.length === 0 || title.length > 80) {
    throw new Error('Checkpoint summary title must be 1-80 characters');
  }
  if (words.length < 2 || words.length > 8) {
    throw new Error('Checkpoint summary title must be 2-8 words');
  }
  if (/[.!?,;:]$/u.test(title)) {
    throw new Error('Checkpoint summary title must not end with punctuation');
  }

  return title;
}

function normalizeSummaryDescription(value: unknown): string {
  if (typeof value !== 'string') {
    throw new Error('Checkpoint summary description must be a string');
  }

  const description = value.trim().replace(/\s+/gu, ' ');
  if (description.length === 0 || description.length > 300) {
    throw new Error('Checkpoint summary description must be 1-300 characters');
  }

  return description;
}
