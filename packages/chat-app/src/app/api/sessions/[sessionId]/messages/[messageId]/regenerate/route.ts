import { apiError } from '@/lib/api/response';
import { createSessionsAdapter, parseSessionScope, toSessionLocation } from '@/lib/api/sessions';

type RegenerateRouteContext = {
  params: Promise<{
    sessionId: string;
    messageId: string;
  }>;
};

type RegenerateBody = {
  projectName?: string;
  path?: string;
  branch?: string;
  payload?: Record<string, unknown>;
};

export const runtime = 'nodejs';

function parseBranch(value: string | null | undefined): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseBody(value: unknown): RegenerateBody | undefined {
  if (value === undefined) {
    return {};
  }

  if (!isObjectRecord(value)) {
    return undefined;
  }

  const parsed: RegenerateBody = {};

  if (value.projectName !== undefined) {
    if (typeof value.projectName !== 'string') {
      return undefined;
    }
    parsed.projectName = value.projectName;
  }

  if (value.path !== undefined) {
    if (typeof value.path !== 'string') {
      return undefined;
    }
    parsed.path = value.path;
  }

  if (value.branch !== undefined) {
    if (typeof value.branch !== 'string') {
      return undefined;
    }
    parsed.branch = value.branch;
  }

  if (value.payload !== undefined) {
    if (!isObjectRecord(value.payload)) {
      return undefined;
    }
    parsed.payload = value.payload;
  }

  return parsed;
}

export async function POST(request: Request, context: RegenerateRouteContext): Promise<Response> {
  const { sessionId, messageId } = await context.params;

  if (!sessionId || !messageId) {
    return apiError(400, {
      code: 'INVALID_ROUTE_PARAMS',
      message: 'sessionId and messageId are required.',
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

  const branch = parseBranch(body.branch) ?? `regen-${Date.now()}`;

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

    const sourceNode = await sessionsAdapter.getNode(location, messageId);
    if (!sourceNode) {
      return apiError(404, {
        code: 'MESSAGE_NOT_FOUND',
        message: `Message node not found: ${messageId}`,
      });
    }

    const markerNode = await sessionsAdapter.appendCustom({
      projectName: scope.projectName,
      path: scope.path,
      sessionId,
      parentId: messageId,
      branch,
      payload: {
        type: 'regenerate_requested',
        sourceMessageId: messageId,
        requestedAt: new Date().toISOString(),
        ...body.payload,
      },
    });

    if (!markerNode) {
      return apiError(404, {
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    return Response.json(
      {
        ok: true,
        sessionId,
        sourceNodeId: sourceNode.id,
        branch,
        markerNode,
      },
      { status: 201 }
    );
  } catch {
    return apiError(500, {
      code: 'REGENERATE_FAILED',
      message: 'Failed to enqueue regenerate request.',
    });
  }
}
