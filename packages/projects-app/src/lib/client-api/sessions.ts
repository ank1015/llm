import { apiRequestJson, SERVER_BASE } from './http';

import type { SessionMetadata } from '@/lib/contracts';
import type { SessionSummary } from '@ank1015/llm-sdk';

const SESSIONS_BASE = `${SERVER_BASE}/api/projects/test1/artifacts/research/sessions`;

export async function listSessions(): Promise<SessionSummary[]> {
  return apiRequestJson<SessionSummary[]>(SESSIONS_BASE, {
    method: 'GET',
  });
}

export async function createSession(input: { name?: string }): Promise<SessionMetadata> {
  return apiRequestJson<SessionMetadata>(SESSIONS_BASE, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name ?? 'New chat',
      modelId: 'gpt-5.2',
      api: 'openai',
    }),
  });
}

export async function renameSession(input: {
  sessionId: string;
  name: string;
}): Promise<{ ok: true; sessionId: string; sessionName: string }> {
  return apiRequestJson(`${SESSIONS_BASE}/${encodeURIComponent(input.sessionId)}/name`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: input.name }),
  });
}

export async function generateSessionName(input: {
  sessionId: string;
  query: string;
}): Promise<{ ok: true; sessionId: string; sessionName: string }> {
  return apiRequestJson(`${SESSIONS_BASE}/${encodeURIComponent(input.sessionId)}/generate-name`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: input.query }),
  });
}

export async function deleteSession(
  sessionId: string
): Promise<{ ok: true; sessionId: string; deleted: boolean }> {
  return apiRequestJson(`${SESSIONS_BASE}/${encodeURIComponent(sessionId)}`, {
    method: 'DELETE',
  });
}
