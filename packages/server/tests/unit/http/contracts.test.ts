import { describe, expect, it } from 'vitest';

import {
  toArtifactCheckpointDto,
  toArtifactCheckpointDiffResponse,
  toArtifactCheckpointListResponse,
  toArtifactDirDto,
  toArtifactDirOverviewDto,
  toLiveRunSummaryDto,
  toProjectDto,
  toSessionMetadataDto,
  toSessionSummaryDto,
  toSessionTreeResponse,
  toTerminalMetadataDto,
  toTerminalSummaryDto,
} from '../../../src/http/contracts.js';

import type { LiveRunSummary } from '../../../src/core/session/run-registry.js';
import type {
  ArtifactCheckpoint,
  ArtifactDirMetadata,
  ProjectMetadata,
  SessionMessageNode,
  SessionMetadata,
  SessionSummary,
  TerminalMetadata,
  TerminalSummary,
} from '../../../src/types/index.js';

describe('http/contracts', () => {
  it('maps project, artifact, session, and terminal DTOs without altering values', () => {
    const checkpoint: ArtifactCheckpoint = {
      commitHash: '1234567890abcdef',
      shortHash: '1234567',
      createdAt: '2026-03-30T00:00:00.000Z',
      summaryStatus: 'ready',
      title: 'Checkpoint saved',
      description: 'Captured the latest artifact state.',
      isHead: true,
    };
    const project: ProjectMetadata = {
      id: 'project-a',
      name: 'Project A',
      description: 'Primary project',
      projectImg: 'https://example.com/project.png',
      projectPath: '/tmp/project-a',
      createdAt: '2026-03-30T00:00:00.000Z',
    };
    const artifact: ArtifactDirMetadata = {
      id: 'artifact-a',
      name: 'Artifact A',
      description: 'Research area',
      createdAt: '2026-03-30T00:00:00.000Z',
    };
    const summary: SessionSummary = {
      sessionId: 'session-a',
      sessionName: 'Session A',
      createdAt: '2026-03-30T00:00:00.000Z',
      updatedAt: '2026-03-30T00:05:00.000Z',
      nodeCount: 3,
    };
    const metadata: SessionMetadata = {
      id: 'session-a',
      name: 'Session A',
      modelId: 'codex/gpt-5.4-mini',
      createdAt: '2026-03-30T00:00:00.000Z',
      activeBranch: 'main',
      systemPrompt: 'You are a helpful assistant.',
    };
    const terminalSummary: TerminalSummary = {
      id: 'terminal-a',
      title: 'Terminal 1',
      status: 'running',
      projectId: 'project-a',
      artifactId: 'artifact-a',
      cols: 120,
      rows: 30,
      createdAt: '2026-03-30T00:00:00.000Z',
      lastActiveAt: '2026-03-30T00:00:00.000Z',
      exitCode: null,
      signal: null,
      exitedAt: null,
    };
    const terminalMetadata: TerminalMetadata = {
      ...terminalSummary,
      cwdAtLaunch: '/tmp/project-a/artifact-a',
      shell: '/bin/zsh',
    };

    expect(toProjectDto(project)).toEqual({
      id: 'project-a',
      name: 'Project A',
      description: 'Primary project',
      projectImg: 'https://example.com/project.png',
      createdAt: '2026-03-30T00:00:00.000Z',
    });
    expect(toArtifactDirDto(artifact)).toEqual(artifact);
    expect(toArtifactCheckpointDto(checkpoint)).toEqual(checkpoint);
    expect(
      toArtifactCheckpointListResponse({
        hasRepository: true,
        dirty: false,
        headCommitHash: checkpoint.commitHash,
        checkpoints: [checkpoint],
      })
    ).toEqual({
      hasRepository: true,
      dirty: false,
      headCommitHash: checkpoint.commitHash,
      checkpoints: [checkpoint],
    });
    expect(
      toArtifactCheckpointDiffResponse({
        hasRepository: true,
        headCommitHash: checkpoint.commitHash,
        dirty: true,
        files: [
          {
            path: 'notes.txt',
            previousPath: null,
            changeType: 'modified',
            isBinary: false,
            beforeText: 'before',
            afterText: 'after',
            textTruncated: false,
          },
        ],
      })
    ).toEqual({
      hasRepository: true,
      headCommitHash: checkpoint.commitHash,
      dirty: true,
      files: [
        {
          path: 'notes.txt',
          previousPath: null,
          changeType: 'modified',
          isBinary: false,
          beforeText: 'before',
          afterText: 'after',
          textTruncated: false,
        },
      ],
    });
    expect(toArtifactDirOverviewDto(artifact, [summary])).toEqual({
      ...artifact,
      sessions: [toSessionSummaryDto(summary)],
    });
    expect(toSessionSummaryDto(summary)).toEqual(summary);
    expect(toSessionMetadataDto(metadata)).toEqual(metadata);
    expect(toTerminalSummaryDto(terminalSummary)).toEqual(terminalSummary);
    expect(toTerminalMetadataDto(terminalMetadata)).toEqual(terminalMetadata);
  });

  it('includes live run details only when present on session tree responses', () => {
    const node: SessionMessageNode = {
      type: 'message',
      id: 'node-a',
      parentId: 'session-a',
      branch: 'main',
      timestamp: '2026-03-30T00:00:00.000Z',
      message: {
        role: 'user',
        id: 'msg-a',
        timestamp: 1,
        content: [{ type: 'text', content: 'Hello' }],
      },
      metadata: {
        modelId: 'codex/gpt-5.4-mini',
      },
    };
    const liveRun: LiveRunSummary = {
      runId: 'run-a',
      mode: 'prompt',
      status: 'running',
      startedAt: '2026-03-30T00:00:00.000Z',
    };

    expect(
      toSessionTreeResponse(
        {
          nodes: [node],
          persistedLeafNodeId: 'node-a',
          activeBranch: 'main',
        },
        liveRun
      )
    ).toEqual({
      nodes: [node],
      persistedLeafNodeId: 'node-a',
      activeBranch: 'main',
      liveRun: toLiveRunSummaryDto(liveRun),
    });

    expect(
      toSessionTreeResponse({
        nodes: [node],
        persistedLeafNodeId: null,
        activeBranch: 'main',
      })
    ).toEqual({
      nodes: [node],
      persistedLeafNodeId: null,
      activeBranch: 'main',
    });
  });
});
