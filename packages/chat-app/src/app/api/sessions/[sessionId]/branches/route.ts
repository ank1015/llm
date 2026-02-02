import { notImplemented } from '@/lib/api/placeholder';

export async function GET(): Promise<Response> {
  return notImplemented('/api/sessions/[sessionId]/branches', {
    method: 'GET',
    notes: 'List available branches for the session tree.',
  });
}

export async function POST(): Promise<Response> {
  return notImplemented('/api/sessions/[sessionId]/branches', {
    method: 'POST',
    notes: 'Create a branch from a parent node or switch active branch.',
  });
}
