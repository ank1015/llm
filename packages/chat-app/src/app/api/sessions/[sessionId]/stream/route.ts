import type { AgentEvent } from '@ank1015/llm-sdk';

import {
  parseConversationTurnBody,
  prepareConversationTurn,
  runConversationTurn,
  toConversationFailure,
} from '@/lib/api/conversation';
import { apiError } from '@/lib/api/response';

type StreamRouteContext = {
  params: Promise<{
    sessionId: string;
  }>;
};

export const runtime = 'nodejs';

function toSseChunk(event: string, data: unknown): Uint8Array {
  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  return new TextEncoder().encode(payload);
}

export async function POST(request: Request, context: StreamRouteContext): Promise<Response> {
  const { sessionId } = await context.params;

  const requestBody = await request.json().catch(() => undefined);
  const body = parseConversationTurnBody(requestBody);

  if (!body) {
    return apiError(400, {
      code: 'INVALID_BODY',
      message: 'Request body is invalid for conversation prompt stream.',
    });
  }

  let prepared;
  try {
    prepared = await prepareConversationTurn(sessionId, body);
  } catch (error) {
    const failure = toConversationFailure(error);
    return apiError(failure.status, {
      code: failure.code,
      message: failure.message,
    });
  }

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let closed = false;

      const send = (event: string, data: unknown): void => {
        if (closed) {
          return;
        }

        try {
          controller.enqueue(toSseChunk(event, data));
        } catch {
          closed = true;
        }
      };

      const close = (): void => {
        if (closed) {
          return;
        }

        closed = true;
        controller.close();
      };

      void (async (): Promise<void> => {
        send('ready', {
          ok: true,
          sessionId,
          branch: prepared.branch,
        });

        try {
          const result = await runConversationTurn(prepared, {
            streamAssistantMessage: true,
            requestSignal: request.signal,
            onEvent: (event: AgentEvent) => {
              send('agent_event', event);
            },
          });

          send('done', {
            ok: true,
            sessionId,
            branch: result.branch,
            messageCount: result.newMessages.length,
            nodeCount: result.nodes.length,
          });
        } catch (error) {
          const failure = toConversationFailure(error);
          send('error', {
            ok: false,
            code: failure.code,
            message: failure.message,
          });
        } finally {
          close();
        }
      })();
    },
    cancel() {
      // Request cancellation is handled via request.signal.
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
