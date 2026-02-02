import { notImplemented } from '@/lib/api/placeholder';

export async function GET(): Promise<Response> {
  return notImplemented('/api/sessions/[sessionId]', {
    method: 'GET',
    notes: 'Get full session metadata and current branch info.',
  });
}

export async function PATCH(): Promise<Response> {
  return notImplemented('/api/sessions/[sessionId]', {
    method: 'PATCH',
    notes: 'Update session metadata (name, archive flag, etc.).',
  });
}

export async function DELETE(): Promise<Response> {
  return notImplemented('/api/sessions/[sessionId]', {
    method: 'DELETE',
    notes: 'Delete a session and its message history.',
  });
}
