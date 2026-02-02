import { notImplemented } from '@/lib/api/placeholder';

export async function GET(): Promise<Response> {
  return notImplemented('/api/sessions/[sessionId]/messages', {
    method: 'GET',
    notes: 'List messages for a session/branch with pagination.',
  });
}

export async function POST(): Promise<Response> {
  return notImplemented('/api/sessions/[sessionId]/messages', {
    method: 'POST',
    notes: 'Send a user message and return a non-streaming assistant response.',
  });
}
