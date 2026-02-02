import type { Api, Message } from '@ank1015/llm-sdk';

import { parseApi } from '@/lib/api/keys';
import { apiError } from '@/lib/api/response';
import { createSessionsAdapter, parseSessionScope, toSessionLocation } from '@/lib/api/sessions';

type MessagesRouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

type AppendMessageBody = {
  projectName?: string;
  path?: string;
  parentId?: string;
  branch?: string;
  message?: Message;
  api?: Api;
  modelId?: string;
  providerOptions?: Record<string, unknown>;
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

function isMessage(value: unknown): value is Message {
  if (!isObjectRecord(value)) {
    return false;
  }

  const role = value.role;
  if (role !== 'user' && role !== 'assistant' && role !== 'toolResult' && role !== 'custom') {
    return false;
  }

  return typeof value.id === 'string' && value.id.trim().length > 0;
}

// eslint-disable-next-line sonarjs/cognitive-complexity
function parseAppendMessageBody(value: unknown): AppendMessageBody | undefined {
  if (!isObjectRecord(value)) {
    return undefined;
  }

  const body: AppendMessageBody = {};

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

  if (value.parentId !== undefined) {
    if (typeof value.parentId !== 'string') {
      return undefined;
    }
    body.parentId = value.parentId;
  }

  if (value.branch !== undefined) {
    if (typeof value.branch !== 'string') {
      return undefined;
    }
    body.branch = value.branch;
  }

  if (value.message !== undefined) {
    if (!isMessage(value.message)) {
      return undefined;
    }
    body.message = value.message;
  }

  if (value.api !== undefined) {
    if (typeof value.api !== 'string') {
      return undefined;
    }
    const api = parseApi(value.api);
    if (!api) {
      return undefined;
    }
    body.api = api;
  }

  if (value.modelId !== undefined) {
    if (typeof value.modelId !== 'string') {
      return undefined;
    }
    body.modelId = value.modelId;
  }

  if (value.providerOptions !== undefined) {
    if (!isObjectRecord(value.providerOptions)) {
      return undefined;
    }
    body.providerOptions = value.providerOptions;
  }

  return body;
}

export async function GET(request: Request, context: MessagesRouteContext): Promise<Response> {
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

  const branch = parseBranch(url.searchParams.get('branch'));
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
    const location = toSessionLocation(scope, sessionId);
    const messages = await sessionsAdapter.getMessages(location, branch);

    if (!messages) {
      return apiError(404, {
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
      });
    }

    const paged = messages.slice(offset, limit === undefined ? undefined : offset + limit);

    return Response.json({
      ok: true,
      branch: branch ?? null,
      total: messages.length,
      count: paged.length,
      messages: paged,
    });
  } catch {
    return apiError(500, {
      code: 'MESSAGES_LIST_FAILED',
      message: 'Failed to load messages.',
    });
  }
}

export async function POST(request: Request, context: MessagesRouteContext): Promise<Response> {
  const { sessionId } = await context.params;
  if (!sessionId) {
    return apiError(400, {
      code: 'INVALID_SESSION_ID',
      message: 'Session ID is required.',
    });
  }

  const requestBody = await request.json().catch(() => undefined);
  const body = parseAppendMessageBody(requestBody);
  if (!body) {
    return apiError(400, {
      code: 'INVALID_BODY',
      message: 'Request body is invalid for message append.',
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

  if (!body.message || !body.api || !body.modelId) {
    return apiError(400, {
      code: 'MISSING_FIELDS',
      message: '"message", "api", and "modelId" are required.',
    });
  }

  const branch = parseBranch(body.branch) ?? 'main';

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

    let parentId = body.parentId?.trim();
    if (!parentId) {
      const latestNode = await sessionsAdapter.getLatestNode(location, branch);
      if (!latestNode) {
        return apiError(404, {
          code: 'PARENT_NOT_FOUND',
          message: `No parent node found for branch: ${branch}`,
        });
      }
      parentId = latestNode.id;
    }

    const parentNode = await sessionsAdapter.getNode(location, parentId);
    if (!parentNode) {
      return apiError(404, {
        code: 'PARENT_NOT_FOUND',
        message: `Parent node not found: ${parentId}`,
      });
    }

    const result = await sessionsAdapter.appendMessage({
      projectName: scope.projectName,
      path: scope.path,
      sessionId,
      parentId,
      branch,
      message: body.message,
      api: body.api,
      modelId: body.modelId,
      providerOptions: body.providerOptions ?? {},
    });

    return Response.json(
      {
        ok: true,
        sessionId: result.sessionId,
        node: result.node,
      },
      { status: 201 }
    );
  } catch {
    return apiError(500, {
      code: 'MESSAGE_APPEND_FAILED',
      message: 'Failed to append message node.',
    });
  }
}
