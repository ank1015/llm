import { Value } from '@sinclair/typebox/value';
import { describe, expect, it } from 'vitest';

import {
  ArtifactFileQuerySchema,
  BundledSkillDtoSchema,
  DeleteArtifactSkillResponseSchema,
  KeysListResponseSchema,
  InstalledSkillDtoSchema,
  ProjectDtoSchema,
  ReloadKeyResponseSchema,
  SessionPromptRequestSchema,
  SetKeyRequestSchema,
  SessionSummaryDtoSchema,
  StreamConflictResponseSchema,
  UpdateProjectImageRequestSchema,
} from '../src/index.js';

describe('app contracts', () => {
  it('accepts project image updates keyed by projectId or projectName', () => {
    expect(
      Value.Check(UpdateProjectImageRequestSchema, {
        projectId: 'demo-project',
        projectImg: 'https://example.com/demo.png',
      })
    ).toBe(true);

    expect(
      Value.Check(UpdateProjectImageRequestSchema, {
        projectName: 'Demo Project',
        projectImg: 'https://example.com/demo.png',
      })
    ).toBe(true);
  });

  it('rejects leaked internal project fields', () => {
    expect(
      Value.Check(ProjectDtoSchema, {
        id: 'demo-project',
        name: 'Demo Project',
        description: null,
        projectImg: null,
        createdAt: '2026-03-15T00:00:00.000Z',
        projectPath: '/tmp/demo-project',
      })
    ).toBe(false);
  });

  it('rejects leaked internal session summary fields', () => {
    expect(
      Value.Check(SessionSummaryDtoSchema, {
        sessionId: 'session-1',
        sessionName: 'Test Session',
        createdAt: '2026-03-15T00:00:00.000Z',
        updatedAt: '2026-03-15T01:00:00.000Z',
        nodeCount: 2,
        filePath: '/tmp/demo.jsonl',
        branches: ['main'],
      })
    ).toBe(false);
  });

  it('rejects leaked installed skill filesystem paths', () => {
    expect(
      Value.Check(InstalledSkillDtoSchema, {
        name: 'ai-images',
        description: 'Image helpers',
        path: '/tmp/skill',
      })
    ).toBe(false);
  });

  it('rejects leaked bundled skill filesystem paths', () => {
    expect(
      Value.Check(BundledSkillDtoSchema, {
        name: 'ai-images',
        description: 'Image helpers',
        directory: '/tmp/skills/ai-images',
      })
    ).toBe(false);
  });

  it('accepts a valid stream conflict envelope', () => {
    expect(
      Value.Check(StreamConflictResponseSchema, {
        error: 'A stream is already running for this session.',
        liveRun: {
          runId: 'run-1',
          mode: 'prompt',
          status: 'running',
          startedAt: '2026-03-15T00:00:00.000Z',
        },
      })
    ).toBe(true);
  });

  it('accepts string query params for file reads', () => {
    expect(
      Value.Check(ArtifactFileQuerySchema, {
        path: 'src/index.ts',
        maxBytes: '200000',
      })
    ).toBe(true);
  });

  it('rejects invalid reasoning level values', () => {
    expect(
      Value.Check(SessionPromptRequestSchema, {
        message: 'Hello',
        reasoningLevel: 'extreme',
      })
    ).toBe(false);
  });

  it('accepts the cleaned delete skill response', () => {
    expect(
      Value.Check(DeleteArtifactSkillResponseSchema, {
        ok: true,
        skillName: 'ai-images',
        deleted: true,
      })
    ).toBe(true);
  });

  it('accepts key management requests and responses', () => {
    expect(
      Value.Check(KeysListResponseSchema, {
        providers: [
          {
            api: 'codex',
            hasKey: true,
            credentials: {
              apiKey: 'abcd****wxyz',
            },
          },
          {
            api: 'google',
            hasKey: false,
          },
        ],
      })
    ).toBe(true);

    expect(
      Value.Check(SetKeyRequestSchema, {
        key: 'sk-test',
      })
    ).toBe(true);

    expect(
      Value.Check(ReloadKeyResponseSchema, {
        ok: true,
      })
    ).toBe(true);
  });
});
