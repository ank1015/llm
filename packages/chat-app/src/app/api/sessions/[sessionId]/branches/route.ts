import { apiError } from '@/lib/api/response';
import { createSessionsAdapter, parseSessionScope, toSessionLocation } from '@/lib/api/sessions';

type BranchesRouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

type CreateBranchBody = {
  projectName?: string;
  path?: string;
  branch?: string;
  parentId?: string;
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

// eslint-disable-next-line sonarjs/cognitive-complexity
function parseCreateBranchBody(value: unknown): CreateBranchBody | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const body: CreateBranchBody = {};

  if (value.projectName !== undefined) {
    if (typeof value.projectName !== 'string') {
      return undefined;
    }
    body.projectName = value.projectName;
  }

  if (value.path !== undefined) {
    if (typeof value.path !== 'string') {
      return undefined;
    }
    body.path = value.path;
  }

  if (value.branch !== undefined) {
    if (typeof value.branch !== 'string') {
      return undefined;
    }
    body.branch = value.branch;
  }

  if (value.parentId !== undefined) {
    if (typeof value.parentId !== 'string') {
      return undefined;
    }
    body.parentId = value.parentId;
  }

  if (value.payload !== undefined) {
    if (!isObjectRecord(value.payload)) {
      return undefined;
    }
    body.payload = value.payload;
  }

  return body;
}

export async function GET(request: Request, context: BranchesRouteContext): Promise<Response> {
  const { sessionId } = await context.params;
  if (!sessionId) {
    return apiError(400, {
      code: 'INVALID_SESSION_ID',
      message: 'Session ID is required.',
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
      message: 'Invalid projectName/path. projectName cannot include path separators.',
    });
  }

  try {
    const sessionsAdapter = createSessionsAdapter();
    const branches = await sessionsAdapter.getBranches(toSessionLocation(scope, sessionId));

    if (!branches) {
      return apiError(404, {
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    return Response.json({
      ok: true,
      count: branches.length,
      branches,
    });
  } catch {
    return apiError(500, {
      code: 'BRANCHES_LIST_FAILED',
      message: 'Failed to load branches.',
    });
  }
}

export async function POST(request: Request, context: BranchesRouteContext): Promise<Response> {
  const { sessionId } = await context.params;
  if (!sessionId) {
    return apiError(400, {
      code: 'INVALID_SESSION_ID',
      message: 'Session ID is required.',
    });
  }

  const requestBody = await request.json().catch(() => undefined);
  const body = parseCreateBranchBody(requestBody);
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

  const branch = parseBranch(body.branch);
  if (!branch || branch === 'main') {
    return apiError(400, {
      code: 'INVALID_BRANCH',
      message: '"branch" is required and must not be "main".',
    });
  }

  const parentId = body.parentId?.trim();
  if (!parentId) {
    return apiError(400, {
      code: 'MISSING_PARENT_ID',
      message: '"parentId" is required to create a branch.',
    });
  }

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

    const parentNode = await sessionsAdapter.getNode(location, parentId);
    if (!parentNode) {
      return apiError(404, {
        code: 'PARENT_NOT_FOUND',
        message: `Parent node not found: ${parentId}`,
      });
    }

    const markerNode = await sessionsAdapter.appendCustom({
      projectName: scope.projectName,
      path: scope.path,
      sessionId,
      parentId,
      branch,
      payload: {
        type: 'branch_created',
        branch,
        fromNodeId: parentId,
        ...body.payload,
      },
    });

    if (!markerNode) {
      return apiError(404, {
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    const branches = await sessionsAdapter.getBranches(location);

    return Response.json(
      {
        ok: true,
        branch,
        markerNode,
        branches: branches ?? [],
      },
      { status: 201 }
    );
  } catch {
    return apiError(500, {
      code: 'BRANCH_CREATE_FAILED',
      message: 'Failed to create branch.',
    });
  }
}
