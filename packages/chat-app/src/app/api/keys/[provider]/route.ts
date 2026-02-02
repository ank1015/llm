import { notImplemented } from '@/lib/api/placeholder';

export async function PUT(): Promise<Response> {
  return notImplemented('/api/keys/[provider]', {
    method: 'PUT',
    notes: 'Set or update provider API key.',
  });
}

export async function DELETE(): Promise<Response> {
  return notImplemented('/api/keys/[provider]', {
    method: 'DELETE',
    notes: 'Delete provider API key.',
  });
}
