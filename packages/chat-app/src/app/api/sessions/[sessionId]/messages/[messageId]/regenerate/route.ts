import { notImplemented } from '@/lib/api/placeholder';

export async function POST(): Promise<Response> {
  return notImplemented('/api/sessions/[sessionId]/messages/[messageId]/regenerate', {
    method: 'POST',
    notes: 'Regenerate an assistant response from a selected message node.',
  });
}
