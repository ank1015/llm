import { apiError } from '@/lib/api/response';
import { createSessionsAdapter, parseSessionScope } from '@/lib/api/sessions';

type CreateSessionBody = {
  projectName?: string;
  path?: string;
  sessionName?: string;
};

export const runtime = 'nodejs';

function parseNonNegativeInt(value: string | null): number | undefined {
  if (value === null) {
    return undefined;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return undefined;
  }

  return parsed;
}

function parseCreateBody(value: unknown): CreateSessionBody | undefined {
  if (typeof value !== 'object' || value === null) {
    return undefined;
  }

  const body = value as Record<string, unknown>;
  const parsed: CreateSessionBody = {};

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

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const scope = parseSessionScope({
    projectName: url.searchParams.get('projectName'),
    path: url.searchParams.get('path'),
  });

  if (!scope) {
    return apiError(400, {
      code: 'INVALID_SESSION_SCOPE',
      message: 'Invalid projectName/path. projectName cannot include path separators.',
    });
  }

  const query = url.searchParams.get('query')?.trim() ?? '';
  const limitRaw = url.searchParams.get('limit');
  const offsetRaw = url.searchParams.get('offset');
  const limit = parseNonNegativeInt(limitRaw);
  const parsedOffset = parseNonNegativeInt(offsetRaw);

  if (
    (limitRaw !== null && limit === undefined) ||
    (offsetRaw !== null && parsedOffset === undefined)
  ) {
    return apiError(400, {
      code: 'INVALID_PAGINATION',
      message: 'Query params "limit" and "offset" must be non-negative integers.',
    });
  }

  const offset = parsedOffset ?? 0;

  try {
    const sessionsAdapter = createSessionsAdapter();
    const sessions = query
      ? await sessionsAdapter.searchSessions(scope.projectName, query, scope.path)
      : await sessionsAdapter.listSessions(scope.projectName, scope.path);

    const paged = sessions.slice(offset, limit === undefined ? undefined : offset + limit);

    return Response.json({
      ok: true,
      projectName: scope.projectName,
      path: scope.path,
      query: query || null,
      total: sessions.length,
      count: paged.length,
      sessions: paged,
    });
  } catch {
    return apiError(500, {
      code: 'SESSIONS_LIST_FAILED',
      message: 'Failed to list sessions.',
    });
  }
}

export async function POST(request: Request): Promise<Response> {
  const requestBody = await request.json().catch(() => undefined);
  const body = parseCreateBody(requestBody);

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
  if (body.sessionName !== undefined && !sessionName) {
    return apiError(400, {
      code: 'INVALID_SESSION_NAME',
      message: '"sessionName" must be a non-empty string when provided.',
    });
  }

  try {
    const sessionsAdapter = createSessionsAdapter();
    const result = await sessionsAdapter.createSession({
      projectName: scope.projectName,
      path: scope.path,
      sessionName: sessionName ?? 'New chat',
    });

    return Response.json(
      {
        ok: true,
        projectName: scope.projectName,
        path: scope.path,
        sessionId: result.sessionId,
        header: result.header,
      },
      { status: 201 }
    );
  } catch {
    return apiError(500, {
      code: 'SESSION_CREATE_FAILED',
      message: 'Failed to create session.',
    });
  }
}
