import { apiRequestJson, SERVER_BASE } from './http';

import type {
  CreateSessionRequest,
  DeleteSessionResponse,
  ModelSelection,
  SessionMetadataDto,
  SessionNameResponse,
  SessionSummaryDto,
} from '@ank1015/llm-app-contracts';


type ArtifactContext = {
  projectId: string;
  artifactId: string;
};

type CreateSessionInput = Omit<CreateSessionRequest, 'api' | 'modelId'> &
  ModelSelection & {
    name?: string;
  };

function buildSessionsBase(ctx: ArtifactContext): string {
  return `${SERVER_BASE}/api/projects/${encodeURIComponent(ctx.projectId)}/artifacts/${encodeURIComponent(ctx.artifactId)}/sessions`;
}

export async function listSessions(ctx: ArtifactContext): Promise<SessionSummaryDto[]> {
  return apiRequestJson<SessionSummaryDto[]>(buildSessionsBase(ctx), {
    method: 'GET',
  });
}

export async function createSession(
  ctx: ArtifactContext,
  input: CreateSessionInput
): Promise<SessionMetadataDto> {
  return apiRequestJson<SessionMetadataDto>(buildSessionsBase(ctx), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: input.name ?? 'New chat',
      modelId: input.modelId,
      api: input.api,
    }),
  });
}

export async function renameSession(
  ctx: ArtifactContext,
  input: { sessionId: string; name: string }
): Promise<SessionNameResponse> {
  return apiRequestJson<SessionNameResponse>(
    `${buildSessionsBase(ctx)}/${encodeURIComponent(input.sessionId)}/name`,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: input.name }),
    }
  );
}

export async function generateSessionName(
  ctx: ArtifactContext,
  input: { sessionId: string; query: string }
): Promise<SessionNameResponse> {
  return apiRequestJson<SessionNameResponse>(
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
): Promise<DeleteSessionResponse> {
  return apiRequestJson<DeleteSessionResponse>(
    `${buildSessionsBase(ctx)}/${encodeURIComponent(sessionId)}`,
    {
      method: 'DELETE',
    }
  );
}

export type { SessionMetadataDto, SessionSummaryDto };
