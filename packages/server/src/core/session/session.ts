import { randomUUID } from 'node:crypto';
import { appendFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

import { createAllTools, createSystemPrompt } from '@ank1015/llm-agents';
import { agent, getText, llm, userMessage } from '@ank1015/llm-sdk';
import {
  createSession as createSdkSession,
  readSession,
} from '@ank1015/llm-sdk/session';

import { ArtifactDir } from '../artifact-dir/artifact-dir.js';
import { getConfig } from '../config.js';
import { Project } from '../project/project.js';
import { ensureDir, pathExists } from '../storage/fs.js';
import {
  buildPromptUserMessage,
  cloneUserMessage,
  rewriteUserMessageVisibleText,
} from './user-message.js';

import type {
  AgentEvent,
  AgentResult,
  AgentRun,
  AgentTool,
  CuratedModelId,
  Message,
  ReasoningEffort,
  UserMessage,
} from '@ank1015/llm-sdk';
import type {
  Session as StoredSession,
  SessionHeaderNode,
  SessionMessageNode as StoredMessageNode,
  SessionNode as StoredSessionNode,
  SessionNodeSaver,
} from '@ank1015/llm-sdk/session';
import type {
  CreateSessionOptions,
  PromptInput,
  SessionHeaderMetadata,
  SessionMessageNode,
  SessionMetadata,
  SessionSummary,
} from '../../types/index.js';

type SessionExecutionConfig = {
  modelId: CuratedModelId;
  reasoningEffort: ReasoningEffort;
};

type PathContext = {
  branch: string;
  leafNodeId: string;
  messageNodes: SessionMessageNode[];
  tree: StoredSession;
  persistedActiveBranch: string;
};

type StreamRunOptions = {
  onEvent: (event: AgentEvent) => void;
  onNodePersisted?: (node: SessionMessageNode) => void;
  signal?: AbortSignal;
};

type SessionNodeSaverConfig = {
  branch: string;
  modelId: CuratedModelId;
  activateBranchOnFirstPersist: boolean;
  onNodePersisted?: (node: SessionMessageNode) => void;
};

type LegacyRecord = Record<string, unknown>;

const DEFAULT_SESSION_NAME = 'Untitled Session';
const DEFAULT_ACTIVE_BRANCH = 'main';
const DEFAULT_REASONING_EFFORT: ReasoningEffort = 'high';
const DEFAULT_NAMING_MODEL_ID = 'google/gemini-3-flash-preview' as const;

function getSessionsBaseDir(projectId: string, artifactDirId: string): string {
  const { dataRoot } = getConfig();
  return join(dataRoot, projectId, 'artifacts', artifactDirId, 'sessions');
}

function getSessionFilePath(baseDir: string, sessionId: string): string {
  return join(baseDir, `${sessionId}.jsonl`);
}

function getLegacySessionsDir(baseDir: string, projectId: string): string {
  return join(baseDir, projectId);
}

function getLegacySessionFilePath(baseDir: string, projectId: string, sessionId: string): string {
  return join(getLegacySessionsDir(baseDir, projectId), `${sessionId}.jsonl`);
}

async function resolveExistingSessionFilePath(
  projectId: string,
  artifactDirId: string,
  sessionId: string
): Promise<string | null> {
  const baseDir = getSessionsBaseDir(projectId, artifactDirId);
  const candidates = [
    getSessionFilePath(baseDir, sessionId),
    getLegacySessionFilePath(baseDir, projectId, sessionId),
  ];

  for (const candidate of candidates) {
    if (await pathExists(candidate)) {
      return candidate;
    }
  }

  return null;
}

async function listSessionFilePaths(baseDir: string): Promise<string[]> {
  const entries = await readdir(baseDir, { withFileTypes: true });
  const directFiles = entries
    .filter((entry) => entry.isFile() && isSessionFileName(entry.name))
    .map((entry) => join(baseDir, entry.name));

  const nestedFileGroups = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory() && entry.name !== 'meta')
      .map(async (entry) => {
        const nestedDir = join(baseDir, entry.name);
        const nestedEntries = await readdir(nestedDir, { withFileTypes: true });

        return nestedEntries
          .filter((nestedEntry) => nestedEntry.isFile() && isSessionFileName(nestedEntry.name))
          .map((nestedEntry) => join(nestedDir, nestedEntry.name));
      })
  );

  return [...directFiles, ...nestedFileGroups.flat()];
}

function normalizeSessionName(name: string | undefined): string {
  const trimmed = name?.trim();
  return trimmed ? trimmed : DEFAULT_SESSION_NAME;
}

function isSessionFileName(fileName: string): boolean {
  return fileName.endsWith('.jsonl');
}

function getLegacyString(record: LegacyRecord, key: string): string | undefined {
  const value = record[key];
  return typeof value === 'string' ? value : undefined;
}

function resolveSessionModelId(session: StoredSession): CuratedModelId | null {
  const headerRecord = session.header as SessionHeaderNode & LegacyRecord;
  const headerMetadata = (headerRecord.metadata ?? {}) as LegacyRecord;

  if (typeof headerMetadata['modelId'] === 'string') {
    return headerMetadata['modelId'] as CuratedModelId;
  }

  if (typeof headerRecord['modelId'] === 'string') {
    return headerRecord['modelId'] as CuratedModelId;
  }

  for (let index = session.nodes.length - 1; index >= 0; index -= 1) {
    const node = session.nodes[index] as StoredSessionNode & LegacyRecord;
    const metadata = (node.metadata ?? {}) as LegacyRecord;

    if (typeof metadata['modelId'] === 'string') {
      return metadata['modelId'] as CuratedModelId;
    }

    if (typeof node['modelId'] === 'string') {
      return node['modelId'] as CuratedModelId;
    }
  }

  return null;
}

function parseHeaderMetadata(
  header: SessionHeaderNode,
  fallbackModelId?: CuratedModelId | null
): SessionHeaderMetadata {
  const headerRecord = header as SessionHeaderNode & LegacyRecord;
  const metadata = (header.metadata ?? {}) as LegacyRecord;
  const modelId = metadata['modelId'];
  const legacyModelId = getLegacyString(headerRecord, 'modelId');
  const resolvedModelId =
    typeof modelId === 'string'
      ? (modelId as CuratedModelId)
      : legacyModelId
        ? (legacyModelId as CuratedModelId)
        : fallbackModelId ?? null;

  if (!resolvedModelId) {
    throw new Error(`Session "${header.id}" is missing required header metadata "modelId"`);
  }

  return {
    modelId: resolvedModelId,
    activeBranch:
      typeof metadata['activeBranch'] === 'string'
        ? metadata['activeBranch']
        : getLegacyString(headerRecord, 'branch')
          ? (getLegacyString(headerRecord, 'branch') as string)
        : DEFAULT_ACTIVE_BRANCH,
  };
}

function toSessionMetadata(
  header: SessionHeaderNode,
  fallbackModelId?: CuratedModelId | null
): SessionMetadata {
  const headerRecord = header as SessionHeaderNode & LegacyRecord;
  const metadata = parseHeaderMetadata(header, fallbackModelId);
  const legacySessionName = getLegacyString(headerRecord, 'sessionName');
  const legacyTimestamp = getLegacyString(headerRecord, 'timestamp');

  return {
    id: header.id,
    name: header.title ?? legacySessionName ?? DEFAULT_SESSION_NAME,
    modelId: metadata.modelId,
    createdAt: header.createdAt ?? legacyTimestamp ?? new Date(0).toISOString(),
    activeBranch: metadata.activeBranch ?? DEFAULT_ACTIVE_BRANCH,
  };
}

function toSessionMessageNode(node: StoredMessageNode): SessionMessageNode {
  return node as SessionMessageNode;
}

function serializeSession(session: StoredSession): string {
  return [session.header, ...session.nodes].map((entry) => JSON.stringify(entry)).join('\n') + '\n';
}

async function rewriteSessionHeader(
  path: string,
  update: (header: SessionHeaderNode) => SessionHeaderNode
): Promise<StoredSession> {
  const session = await readSession(path);
  if (!session) {
    throw new Error(`Session not found: ${path}`);
  }

  session.header = update(session.header);
  await writeFile(path, serializeSession(session), 'utf8');
  return session;
}

async function appendSessionEntry(path: string, node: StoredSessionNode): Promise<void> {
  await ensureDir(dirname(path));
  await appendFile(path, `${JSON.stringify(node)}\n`, 'utf8');
}

function findLatestNodeInBranch(
  nodes: StoredSessionNode[],
  branch: string
): StoredSessionNode | undefined {
  for (let index = nodes.length - 1; index >= 0; index -= 1) {
    const node = nodes[index];
    if (node?.branch === branch) {
      return node;
    }
  }

  return undefined;
}

function fallbackGeneratedName(query: string): string {
  const trimmed = query.trim();
  return trimmed ? trimmed.slice(0, 50) : 'New chat';
}

export class Session {
  private readonly baseDir: string;
  private readonly sessionPath: string;

  constructor(
    readonly projectId: string,
    readonly artifactDirId: string,
    readonly sessionId: string,
    readonly modelId: CuratedModelId,
    sessionPath?: string
  ) {
    this.baseDir = getSessionsBaseDir(projectId, artifactDirId);
    this.sessionPath = sessionPath ?? getSessionFilePath(this.baseDir, sessionId);
  }

  static async create(
    projectId: string,
    artifactDirId: string,
    options: CreateSessionOptions
  ): Promise<Session> {
    const baseDir = getSessionsBaseDir(projectId, artifactDirId);
    const sessionId = randomUUID();

    await ensureDir(baseDir);
    await createSdkSession({
      id: sessionId,
      path: getSessionFilePath(baseDir, sessionId),
      title: normalizeSessionName(options.name),
      metadata: {
        modelId: options.modelId,
        activeBranch: DEFAULT_ACTIVE_BRANCH,
      },
    });

    return new Session(projectId, artifactDirId, sessionId, options.modelId);
  }

  static async getById(
    projectId: string,
    artifactDirId: string,
    sessionId: string
  ): Promise<Session> {
    const sessionPath = await resolveExistingSessionFilePath(projectId, artifactDirId, sessionId);
    if (!sessionPath) {
      throw new Error(`Session "${sessionId}" not found in artifact dir "${artifactDirId}"`);
    }

    const session = await readSession(sessionPath);
    if (!session) {
      throw new Error(`Session "${sessionId}" not found in artifact dir "${artifactDirId}"`);
    }

    const modelId = resolveSessionModelId(session);
    return new Session(
      projectId,
      artifactDirId,
      sessionId,
      parseHeaderMetadata(session.header, modelId).modelId,
      sessionPath
    );
  }

  static async list(projectId: string, artifactDirId: string): Promise<SessionSummary[]> {
    const baseDir = getSessionsBaseDir(projectId, artifactDirId);
    if (!(await pathExists(baseDir))) {
      return [];
    }

    const sessionPaths = await listSessionFilePaths(baseDir);
    const summaries = await Promise.all(
      sessionPaths.map(async (sessionPath): Promise<SessionSummary | null> => {
        try {
          const [session, fileStats] = await Promise.all([readSession(sessionPath), stat(sessionPath)]);
          if (!session) {
            return null;
          }

          const headerRecord = session.header as SessionHeaderNode & LegacyRecord;
          const summaryTimestamp =
            session.header.createdAt ??
            getLegacyString(headerRecord, 'timestamp') ??
            fileStats.mtime.toISOString();
          const summaryName =
            session.header.title ??
            getLegacyString(headerRecord, 'sessionName') ??
            DEFAULT_SESSION_NAME;

          return {
            sessionId: session.header.id,
            sessionName: summaryName,
            createdAt: summaryTimestamp,
            updatedAt: fileStats.mtime.toISOString(),
            nodeCount: session.nodes.length,
          };
        } catch {
          return null;
        }
      })
    );

    return summaries
      .filter((summary): summary is SessionSummary => summary !== null)
      .sort((left, right) => left.createdAt.localeCompare(right.createdAt));
  }

  static async delete(projectId: string, artifactDirId: string, sessionId: string): Promise<void> {
    const sessionPath = await resolveExistingSessionFilePath(projectId, artifactDirId, sessionId);
    if (sessionPath) {
      await rm(sessionPath, { force: true });
    }
  }

  async getMetadata(): Promise<SessionMetadata> {
    const session = await this.getStoredSession();
    return toSessionMetadata(session.header, resolveSessionModelId(session));
  }

  async updateName(name: string): Promise<void> {
    await rewriteSessionHeader(this.sessionPath, (header) => ({
      ...header,
      title: name,
    }));
  }

  async generateName(query: string): Promise<string> {
    try {
      const response = await llm({
        modelId: DEFAULT_NAMING_MODEL_ID,
        messages: [userMessage(query)],
        system:
          "You are a conversation naming assistant. Given the user's first message, generate a short, descriptive topic name (2-6 words) for the conversation. Reply with ONLY the topic name, nothing else. No quotes, no punctuation at the end, no explanation.",
      });
      const generatedName = getText(response).trim().replace(/^["']|["']$/g, '');
      const nextName = generatedName || fallbackGeneratedName(query);

      await this.updateName(nextName);
      return nextName;
    } catch {
      const nextName = fallbackGeneratedName(query);
      await this.updateName(nextName);
      return nextName;
    }
  }

  async prompt(input: PromptInput): Promise<Message[]> {
    const [execution, context, agentConfig, nextUserMessage] = await Promise.all([
      Promise.resolve(this.resolveExecutionConfig(input)),
      this.loadPathContext(input.leafNodeId),
      this.loadAgentConfig(),
      this.createPromptUserMessage(input),
    ]);

    const newMessages = await this.runAgentTurn({
      execution,
      branch: context.branch,
      headId: context.leafNodeId,
      activateBranchOnFirstPersist: context.branch !== context.persistedActiveBranch,
      agentConfig,
      userMessage: nextUserMessage,
    });

    return [nextUserMessage, ...newMessages];
  }

  async streamPrompt(input: PromptInput, options: StreamRunOptions): Promise<Message[]> {
    const [execution, context, agentConfig, nextUserMessage] = await Promise.all([
      Promise.resolve(this.resolveExecutionConfig(input)),
      this.loadPathContext(input.leafNodeId),
      this.loadAgentConfig(),
      this.createPromptUserMessage(input),
    ]);

    const newMessages = await this.runAgentTurn({
      execution,
      branch: context.branch,
      headId: context.leafNodeId,
      activateBranchOnFirstPersist: context.branch !== context.persistedActiveBranch,
      agentConfig,
      userMessage: nextUserMessage,
      options,
    });

    return [nextUserMessage, ...newMessages];
  }

  async getHistory(): Promise<Message[]> {
    const messageNodes = await this.getHistoryNodes();
    return messageNodes.map((node) => node.message);
  }

  async getHistoryNodes(): Promise<SessionMessageNode[]> {
    const context = await this.loadPersistedPathContext();
    return context.messageNodes;
  }

  async getMessageTree(): Promise<{
    nodes: SessionMessageNode[];
    persistedLeafNodeId: string | null;
    activeBranch: string;
  }> {
    const [metadata, tree] = await Promise.all([this.getMetadata(), this.getStoredSession()]);
    const persistedActiveBranch = this.resolvePersistedActiveBranch(tree, metadata.activeBranch);
    const persistedContext = this.resolvePersistedPathContext(tree, persistedActiveBranch);

    return {
      nodes: tree.nodes
        .filter((node): node is StoredMessageNode => node.type === 'message')
        .map((node) => toSessionMessageNode(node)),
      persistedLeafNodeId:
        persistedContext.messageNodes[persistedContext.messageNodes.length - 1]?.id ?? null,
      activeBranch: persistedActiveBranch,
    };
  }

  async streamRetryFromUserMessage(
    nodeId: string,
    input: Omit<PromptInput, 'message'>,
    options: StreamRunOptions
  ): Promise<Message[]> {
    return this.streamRewriteFromUserMessage({
      nodeId,
      input,
      options,
      branchPrefix: 'retry',
    });
  }

  async streamEditFromUserMessage(
    nodeId: string,
    input: PromptInput,
    options: StreamRunOptions
  ): Promise<Message[]> {
    return this.streamRewriteFromUserMessage({
      nodeId,
      input,
      options,
      branchPrefix: 'edit',
      messageOverride: input.message,
    });
  }

  private async loadAgentConfig(): Promise<{ systemPrompt: string; tools: AgentTool[] }> {
    const [project, artifactDir] = await Promise.all([
      Project.getById(this.projectId),
      ArtifactDir.getById(this.projectId, this.artifactDirId),
    ]);
    const [projectMetadata, artifactMetadata] = await Promise.all([
      project.getMetadata(),
      artifactDir.getMetadata(),
    ]);

    return {
      systemPrompt: await createSystemPrompt({
        projectName: projectMetadata.name,
        projectDir: project.projectPath,
        artifactName: artifactMetadata.name,
        artifactDir: artifactDir.dirPath,
      }),
      tools: Object.values(createAllTools(artifactDir.dirPath)) as unknown as AgentTool[],
    };
  }

  private resolveExecutionConfig(
    input: Pick<PromptInput, 'modelId' | 'reasoningEffort'>
  ): SessionExecutionConfig {
    return {
      modelId: input.modelId ?? this.modelId,
      reasoningEffort: input.reasoningEffort ?? DEFAULT_REASONING_EFFORT,
    };
  }

  private async runAgentTurn(input: {
    execution: SessionExecutionConfig;
    branch: string;
    headId: string;
    activateBranchOnFirstPersist: boolean;
    agentConfig: { systemPrompt: string; tools: AgentTool[] };
    userMessage: UserMessage;
    options?: StreamRunOptions;
  }): Promise<Message[]> {
    const run = agent({
      modelId: input.execution.modelId,
      inputMessages: [input.userMessage],
      system: input.agentConfig.systemPrompt,
      tools: input.agentConfig.tools,
      reasoningEffort: input.execution.reasoningEffort,
      ...(input.options?.signal ? { signal: input.options.signal } : {}),
      session: {
        path: this.sessionPath,
        branch: input.branch,
        headId: input.headId,
        saveNode: this.createSessionNodeSaver({
          branch: input.branch,
          modelId: input.execution.modelId,
          activateBranchOnFirstPersist: input.activateBranchOnFirstPersist,
          ...(input.options?.onNodePersisted
            ? { onNodePersisted: input.options.onNodePersisted }
            : {}),
        }),
      },
    });

    const result = input.options?.onEvent
      ? await this.collectStreamedRun(run, input.options.onEvent)
      : await run;

    if (!result.ok && result.error.phase !== 'aborted') {
      throw new Error(result.error.message);
    }

    return result.newMessages;
  }

  private createSessionNodeSaver(config: SessionNodeSaverConfig): SessionNodeSaver {
    let didActivateBranch = !config.activateBranchOnFirstPersist;

    return async ({ path, node }) => {
      let persistedNode: StoredSessionNode = node;

      if (node.type === 'message') {
        persistedNode = {
          ...node,
          metadata: {
            ...(node.metadata ?? {}),
            modelId: config.modelId,
          },
        };
        Object.assign(node, persistedNode);
      }

      await appendSessionEntry(path, persistedNode);

      if (!didActivateBranch) {
        didActivateBranch = true;
        await this.setActiveBranch(config.branch);
      }

      if (persistedNode.type === 'message') {
        config.onNodePersisted?.(toSessionMessageNode(persistedNode));
      }
    };
  }

  private async streamRewriteFromUserMessage(input: {
    nodeId: string;
    input: Omit<PromptInput, 'message'>;
    options: StreamRunOptions;
    branchPrefix: 'retry' | 'edit';
    messageOverride?: string;
  }): Promise<Message[]> {
    const execution = this.resolveExecutionConfig(input.input);
    const [context, agentConfig] = await Promise.all([
      this.loadPathContext(input.input.leafNodeId),
      this.loadAgentConfig(),
    ]);

    const targetNode = context.messageNodes.find((node) => node.id === input.nodeId);
    if (!targetNode) {
      throw new Error(`User message "${input.nodeId}" was not found on the selected path`);
    }
    if (targetNode.message.role !== 'user') {
      throw new Error('Only user messages can be edited or retried');
    }

    const baseUserMessage =
      input.messageOverride !== undefined
        ? rewriteUserMessageVisibleText(targetNode.message as UserMessage, input.messageOverride)
        : cloneUserMessage(targetNode.message as UserMessage);
    if (baseUserMessage.content.length === 0) {
      throw new Error('Edited message cannot be empty');
    }

    const branch = this.createBranchName(input.branchPrefix);
    const newMessages = await this.runAgentTurn({
      execution,
      branch,
      headId: targetNode.parentId,
      activateBranchOnFirstPersist: true,
      agentConfig,
      userMessage: baseUserMessage,
      options: input.options,
    });

    return [baseUserMessage, ...newMessages];
  }

  private async collectStreamedRun(
    run: AgentRun,
    onEvent: (event: AgentEvent) => void
  ): Promise<AgentResult> {
    for await (const event of run) {
      onEvent(event);
    }

    return run;
  }

  private async loadPersistedPathContext(): Promise<PathContext> {
    return this.loadPathContext();
  }

  private async loadPathContext(leafNodeId?: string): Promise<PathContext> {
    const [metadata, tree] = await Promise.all([this.getMetadata(), this.getStoredSession()]);
    const persistedActiveBranch = this.resolvePersistedActiveBranch(tree, metadata.activeBranch);

    if (leafNodeId) {
      return this.resolvePathContextFromLeaf(tree, persistedActiveBranch, leafNodeId);
    }

    return this.resolvePersistedPathContext(tree, persistedActiveBranch);
  }

  private async getStoredSession(): Promise<StoredSession> {
    const session = await readSession(this.sessionPath);
    if (!session) {
      throw new Error(`Session "${this.sessionId}" not found`);
    }
    return session;
  }

  private resolvePersistedActiveBranch(tree: StoredSession, activeBranch: string): string {
    return tree.nodes.some((node) => node.branch === activeBranch)
      ? activeBranch
      : DEFAULT_ACTIVE_BRANCH;
  }

  private resolvePersistedPathContext(
    tree: StoredSession,
    persistedActiveBranch: string
  ): PathContext {
    const leafNode = findLatestNodeInBranch(tree.nodes, persistedActiveBranch);

    if (!leafNode) {
      return {
        branch: persistedActiveBranch,
        leafNodeId: tree.header.id,
        messageNodes: [],
        tree,
        persistedActiveBranch,
      };
    }

    return {
      branch: persistedActiveBranch,
      leafNodeId: leafNode.id,
      messageNodes: this.getMessagePathNodesToNode(tree, leafNode.id),
      tree,
      persistedActiveBranch,
    };
  }

  private resolvePathContextFromLeaf(
    tree: StoredSession,
    persistedActiveBranch: string,
    leafNodeId: string
  ): PathContext {
    const node = tree.nodes.find((candidate) => candidate.id === leafNodeId);
    if (!node) {
      throw new Error(`Leaf node "${leafNodeId}" was not found in session "${this.sessionId}"`);
    }
    if (node.type !== 'message') {
      throw new Error('leafNodeId must reference a message node');
    }
    if (!this.isLeafNode(tree, node.id)) {
      throw new Error(`Leaf node "${leafNodeId}" is not a visible leaf node`);
    }

    return {
      branch: node.branch,
      leafNodeId: node.id,
      messageNodes: this.getMessagePathNodesToNode(tree, node.id),
      tree,
      persistedActiveBranch,
    };
  }

  private getMessagePathNodesToNode(tree: StoredSession, nodeId: string): SessionMessageNode[] {
    return this.getLineageToNode(tree, nodeId)
      .filter((node): node is StoredMessageNode => node.type === 'message')
      .map((node) => toSessionMessageNode(node));
  }

  private async createPromptUserMessage(
    input: Pick<PromptInput, 'message' | 'attachments'>
  ): Promise<UserMessage> {
    const artifactDir = await ArtifactDir.getById(this.projectId, this.artifactDirId);

    return buildPromptUserMessage({
      artifactDir: artifactDir.dirPath,
      message: input.message,
      ...(input.attachments ? { attachments: input.attachments } : {}),
    });
  }

  private isLeafNode(tree: StoredSession, nodeId: string): boolean {
    return !tree.nodes.some((node) => node.parentId === nodeId);
  }

  private getLineageToNode(
    tree: StoredSession,
    nodeId: string
  ): Array<SessionHeaderNode | StoredSessionNode> {
    if (nodeId === tree.header.id) {
      return [tree.header];
    }

    const nodeMap = new Map<string, StoredSessionNode>(tree.nodes.map((node) => [node.id, node]));
    const lineage: Array<SessionHeaderNode | StoredSessionNode> = [];
    let current = nodeMap.get(nodeId);

    if (!current) {
      throw new Error(`Node "${nodeId}" was not found in session "${this.sessionId}"`);
    }

    while (current) {
      lineage.push(current);

      if (current.parentId === tree.header.id) {
        lineage.push(tree.header);
        break;
      }

      const parent = nodeMap.get(current.parentId);
      if (!parent) {
        throw new Error(`Node "${current.id}" has a missing parent in session "${this.sessionId}"`);
      }
      current = parent;
    }

    return lineage.reverse();
  }

  private createBranchName(prefix: 'retry' | 'edit'): string {
    return `${prefix}-${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
  }

  private async setActiveBranch(branch: string): Promise<void> {
    await rewriteSessionHeader(this.sessionPath, (header) => {
      const currentMetadata = parseHeaderMetadata(header, this.modelId);

      return {
        ...header,
        metadata: {
          ...(header.metadata ?? {}),
          modelId: currentMetadata.modelId,
          activeBranch: branch,
        },
      };
    });
  }
}
