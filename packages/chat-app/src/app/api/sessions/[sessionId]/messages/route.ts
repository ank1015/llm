import {
  parseConversationTurnBody,
  prepareConversationTurn,
  runConversationTurn,
  toConversationFailure,
} from '@/lib/api/conversation';
import { apiError } from '@/lib/api/response';
import { createSessionsAdapter, parseSessionScope, toSessionLocation } from '@/lib/api/sessions';

type MessagesRouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
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

  const requestBody = await request.json().catch(() => undefined);
  const body = parseConversationTurnBody(requestBody);

  if (!body) {
    return apiError(400, {
      code: 'INVALID_BODY',
      message: 'Request body is invalid for conversation prompt.',
    });
  }

  try {
    const prepared = await prepareConversationTurn(sessionId, body);
    const result = await runConversationTurn(prepared, {
      streamAssistantMessage: false,
      requestSignal: request.signal,
    });

    return Response.json(
      {
        ok: true,
        sessionId,
        branch: result.branch,
        messageCount: result.newMessages.length,
        messages: result.newMessages,
        nodes: result.nodes,
      },
      { status: 201 }
    );
  } catch (error) {
    const failure = toConversationFailure(error);
    return apiError(failure.status, {
      code: failure.code,
      message: failure.message,
    });
  }
}
