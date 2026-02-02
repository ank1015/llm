import { notImplemented } from '@/lib/api/placeholder';

export async function POST(): Promise<Response> {
  return notImplemented('/api/sessions/[sessionId]/stream', {
    method: 'POST',
    notes: 'Send a user message and stream assistant events via SSE.',
  });
}
