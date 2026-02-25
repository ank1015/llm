import { apiRequestJson, SERVER_BASE } from './http';

import type { SessionMetadata } from '@/lib/contracts';
import type { SessionSummary } from '@ank1015/llm-sdk';

type ArtifactContext = {
  projectId: string;
  artifactId: string;
};

function buildSessionsBase(ctx: ArtifactContext): string {
  return `${SERVER_BASE}/api/projects/${encodeURIComponent(ctx.projectId)}/artifacts/${encodeURIComponent(ctx.artifactId)}/sessions`;
}

export async function listSessions(ctx: ArtifactContext): Promise<SessionSummary[]> {
  return apiRequestJson<SessionSummary[]>(buildSessionsBase(ctx), {
    method: 'GET',
  });
}

export async function createSession(
  ctx: ArtifactContext,
  input: { name?: string }
): Promise<SessionMetadata> {
  return apiRequestJson<SessionMetadata>(buildSessionsBase(ctx), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name ?? 'New chat',
      modelId: 'gpt-5.2',
      api: 'openai',
    }),
  });
}

export async function renameSession(
  ctx: ArtifactContext,
  input: { sessionId: string; name: string }
): Promise<{ ok: true; sessionId: string; sessionName: string }> {
  return apiRequestJson(`${buildSessionsBase(ctx)}/${encodeURIComponent(input.sessionId)}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.name }),
  });
}

export async function generateSessionName(
  ctx: ArtifactContext,
  input: { sessionId: string; query: string }
): Promise<{ ok: true; sessionId: string; sessionName: string }> {
  return apiRequestJson(
    `${buildSessionsBase(ctx)}/${encodeURIComponent(input.sessionId)}/generate-name`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: input.query }),
    }
  );
}

export async function deleteSession(
  ctx: ArtifactContext,
  sessionId: string
): Promise<{ ok: true; sessionId: string; deleted: boolean }> {
  return apiRequestJson(`${buildSessionsBase(ctx)}/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}
