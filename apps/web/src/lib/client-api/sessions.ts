import { apiRequestJson, SERVER_BASE } from "./http";

import type { ArtifactContext } from "./projects";
import type {
  CreateSessionRequest,
  DeleteSessionResponse,
  SessionMetadataDto,
  SessionNameResponse,
  SessionSummaryDto,
} from "@ank1015/llm-server/contracts";

export type CreateSessionInput = CreateSessionRequest;

export type RenameSessionInput = {
  sessionId: string;
  name: string;
};

export type GenerateSessionNameInput = {
  sessionId: string;
  query: string;
};

function buildSessionsBase(ctx: ArtifactContext): string {
  return `${SERVER_BASE}/api/projects/${encodeURIComponent(ctx.projectId)}/artifacts/${encodeURIComponent(ctx.artifactId)}/sessions`;
}

export async function listSessions(
  ctx: ArtifactContext,
): Promise<SessionSummaryDto[]> {
  return apiRequestJson<SessionSummaryDto[]>(buildSessionsBase(ctx), {
    method: "GET",
  });
}

export async function createSession(
  ctx: ArtifactContext,
  input: CreateSessionInput,
): Promise<SessionMetadataDto> {
  return apiRequestJson<SessionMetadataDto>(buildSessionsBase(ctx), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export async function getSession(
  ctx: ArtifactContext,
  sessionId: string,
): Promise<SessionMetadataDto> {
  return apiRequestJson<SessionMetadataDto>(
    `${buildSessionsBase(ctx)}/${encodeURIComponent(sessionId)}`,
    {
      method: "GET",
    },
  );
}

export async function renameSession(
  ctx: ArtifactContext,
  input: RenameSessionInput,
): Promise<SessionNameResponse> {
  return apiRequestJson<SessionNameResponse>(
    `${buildSessionsBase(ctx)}/${encodeURIComponent(input.sessionId)}/name`,
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: input.name }),
    },
  );
}

export async function generateSessionName(
  ctx: ArtifactContext,
  input: GenerateSessionNameInput,
): Promise<SessionNameResponse> {
  return apiRequestJson<SessionNameResponse>(
    `${buildSessionsBase(ctx)}/${encodeURIComponent(input.sessionId)}/generate-name`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query: input.query }),
    },
  );
}

export async function deleteSession(
  ctx: ArtifactContext,
  sessionId: string,
): Promise<DeleteSessionResponse> {
  return apiRequestJson<DeleteSessionResponse>(
    `${buildSessionsBase(ctx)}/${encodeURIComponent(sessionId)}`,
    {
      method: "DELETE",
    },
  );
}
