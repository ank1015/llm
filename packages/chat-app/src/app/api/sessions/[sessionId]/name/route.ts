import { apiError } from '@/lib/api/response';
import { createSessionsAdapter, parseSessionScope, toSessionLocation } from '@/lib/api/sessions';

type SessionNameRouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

type UpdateSessionNameBody = {
  projectName?: string;
  path?: string;
  sessionName?: string;
};

export const runtime = 'nodejs';

function parseBody(value: unknown): UpdateSessionNameBody | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const body = value as Record<string, unknown>;
  const parsed: UpdateSessionNameBody = {};

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

async function updateSessionName(
  request: Request,
  context: SessionNameRouteContext
): Promise<Response> {
  const { sessionId } = await context.params;
  if (!sessionId) {
    return apiError(400, {
      code: 'INVALID_SESSION_ID',
      message: 'Session ID is required.',
    });
  }

  const requestBody = await request.json().catch(() => undefined);
  const body = parseBody(requestBody);

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
      message: 'Invalid projectName/path. projectName cannot include path separators.',
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
      message: 'Failed to update session name.',
    });
  }
}

export async function PATCH(request: Request, context: SessionNameRouteContext): Promise<Response> {
  return updateSessionName(request, context);
}

export async function PUT(request: Request, context: SessionNameRouteContext): Promise<Response> {
  return updateSessionName(request, context);
}
