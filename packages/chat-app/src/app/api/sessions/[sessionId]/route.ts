import { apiError } from '@/lib/api/response';
import { createSessionsAdapter, parseSessionScope, toSessionLocation } from '@/lib/api/sessions';

type SessionRouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

type UpdateSessionBody = {
  projectName?: string;
  path?: string;
  sessionName?: string;
};

export const runtime = 'nodejs';

function parseUpdateBody(value: unknown): UpdateSessionBody | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const body = value as Record<string, unknown>;
  const parsed: UpdateSessionBody = {};

  if (body.projectName !== undefined) {
    if (typeof body.projectName !== 'string') {
      return undefined;
    }
    parsed.projectName = body.projectName;
  }

  if (body.path !== undefined) {
    if (typeof body.path !== 'string') {
      return undefined;
    }
    parsed.path = body.path;
  }

  if (body.sessionName !== undefined) {
    if (typeof body.sessionName !== 'string') {
      return undefined;
    }
    parsed.sessionName = body.sessionName;
  }

  return parsed;
}

function parseBranchParam(value: string | null): string | undefined {
  if (value === null) {
    return undefined;
  }

  const branch = value.trim();
  return branch.length > 0 ? branch : undefined;
}

const sessionIdRequiredMessage = 'Session ID is required.';
const inValidPathMessage = 'Invalid projectName/path. projectName cannot include path separators';

export async function GET(request: Request, context: SessionRouteContext): Promise<Response> {
  const { sessionId } = await context.params;
  if (!sessionId) {
    return apiError(400, {
      code: 'INVALID_SESSION_ID',
      message: sessionIdRequiredMessage,
    });
  }

  const url = new URL(request.url);
  const scope = parseSessionScope({
    projectName: url.searchParams.get('projectName'),
    path: url.searchParams.get('path'),
  });
  if (!scope) {
    return apiError(400, {
      code: 'INVALID_SESSION_SCOPE',
      message: inValidPathMessage,
    });
  }

  const branch = parseBranchParam(url.searchParams.get('branch'));

  try {
    const sessionsAdapter = createSessionsAdapter();
    const location = toSessionLocation(scope, sessionId);
    const session = await sessionsAdapter.getSession(location);

    if (!session) {
      return apiError(404, {
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    const [branches, latestNode] = await Promise.all([
      sessionsAdapter.getBranches(location),
      sessionsAdapter.getLatestNode(location, branch),
    ]);

    return Response.json({
      ok: true,
      session,
      branches: branches ?? [],
      latestNode: latestNode ?? null,
    });
  } catch {
    return apiError(500, {
      code: 'SESSION_GET_FAILED',
      message: 'Failed to load session.',
    });
  }
}

export async function PATCH(request: Request, context: SessionRouteContext): Promise<Response> {
  const { sessionId } = await context.params;
  if (!sessionId) {
    return apiError(400, {
      code: 'INVALID_SESSION_ID',
      message: sessionIdRequiredMessage,
    });
  }

  const requestBody = await request.json().catch(() => undefined);
  const body = parseUpdateBody(requestBody);
  if (!body) {
    return apiError(400, {
      code: 'INVALID_BODY',
      message: 'Request body must be a JSON object.',
    });
  }

  const scope = parseSessionScope({
    projectName: body.projectName,
    path: body.path,
  });
  if (!scope) {
    return apiError(400, {
      code: 'INVALID_SESSION_SCOPE',
      message: inValidPathMessage,
    });
  }

  const sessionName = body.sessionName?.trim();
  if (!sessionName) {
    return apiError(400, {
      code: 'INVALID_SESSION_NAME',
      message: '"sessionName" is required and must be non-empty.',
    });
  }

  try {
    const sessionsAdapter = createSessionsAdapter();
    const header = await sessionsAdapter.updateSessionName(
      toSessionLocation(scope, sessionId),
      sessionName
    );

    if (!header) {
      return apiError(404, {
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    return Response.json({
      ok: true,
      sessionId,
      header,
    });
  } catch {
    return apiError(500, {
      code: 'SESSION_UPDATE_FAILED',
      message: 'Failed to update session.',
    });
  }
}

export async function DELETE(request: Request, context: SessionRouteContext): Promise<Response> {
  const { sessionId } = await context.params;
  if (!sessionId) {
    return apiError(400, {
      code: 'INVALID_SESSION_ID',
      message: sessionIdRequiredMessage,
    });
  }

  const url = new URL(request.url);
  const scope = parseSessionScope({
    projectName: url.searchParams.get('projectName'),
    path: url.searchParams.get('path'),
  });
  if (!scope) {
    return apiError(400, {
      code: 'INVALID_SESSION_SCOPE',
      message: inValidPathMessage,
    });
  }

  try {
    const sessionsAdapter = createSessionsAdapter();
    const deleted = await sessionsAdapter.deleteSession(toSessionLocation(scope, sessionId));

    if (!deleted) {
      return apiError(404, {
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    return Response.json({
      ok: true,
      sessionId,
      deleted,
    });
  } catch {
    return apiError(500, {
      code: 'SESSION_DELETE_FAILED',
      message: 'Failed to delete session.',
    });
  }
}
