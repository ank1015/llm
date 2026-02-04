import { complete, getModel } from '@ank1015/llm-sdk';

import { createKeysAdapter } from '@/lib/api/keys';
import { apiError } from '@/lib/api/response';
import { createSessionsAdapter, parseSessionScope, toSessionLocation } from '@/lib/api/sessions';

type RouteContext = {
  params: Promise<{ sessionId: string }>;
};

// eslint-disable-next-line sonarjs/cognitive-complexity
export async function POST(request: Request, context: RouteContext): Promise<Response> {
  const { sessionId } = await context.params;

  let body: { query?: string; projectName?: string; path?: string } | undefined;
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return apiError(400, { code: 'INVALID_BODY', message: 'Invalid JSON body.' });
  }

  const query = typeof body?.query === 'string' ? body.query.trim() : '';
  if (!query) {
    return apiError(400, { code: 'MISSING_QUERY', message: 'Query is required.' });
  }

  const scope = parseSessionScope({
    projectName: body?.projectName,
    path: body?.path,
  });

  if (!scope) {
    return apiError(400, { code: 'INVALID_SCOPE', message: 'Invalid project scope.' });
  }

  const model = getModel('google', 'gemini-3-flash-preview');
  if (!model) {
    return apiError(500, { code: 'MODEL_NOT_FOUND', message: 'Naming model not available.' });
  }

  const keysAdapter = createKeysAdapter();

  try {
    const response = await complete(
      model,
      {
        messages: [
          {
            role: 'user' as const,
            id: 'name-req',
            content: [{ type: 'text' as const, content: query }],
          },
        ],
        systemPrompt:
          "You are a conversation naming assistant. Given the user's first message, generate a short, descriptive topic name (2-6 words) for the conversation. Reply with ONLY the topic name, nothing else. No quotes, no punctuation at the end, no explanation.",
      },
      { keysAdapter }
    );

    // Extract text from the response content blocks
    let generatedName = 'New chat';
    for (const block of response.content) {
      if (block.type === 'response') {
        for (const part of block.content) {
          if (part.type === 'text' && part.content.trim()) {
            generatedName = part.content.trim();
            break;
          }
        }
        break;
      }
    }

    // Update the session name
    const sessionsAdapter = createSessionsAdapter();
    const location = toSessionLocation(scope, sessionId);
    const header = await sessionsAdapter.updateSessionName(location, generatedName);

    if (!header) {
      return apiError(404, { code: 'SESSION_NOT_FOUND', message: 'Session not found.' });
    }

    return Response.json({
      ok: true,
      sessionId,
      sessionName: generatedName,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate name.';
    return apiError(500, { code: 'GENERATE_NAME_FAILED', message });
  }
}
