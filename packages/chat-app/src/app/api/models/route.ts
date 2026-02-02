import { notImplemented } from '@/lib/api/placeholder';

export async function GET(): Promise<Response> {
  return notImplemented('/api/models', {
    method: 'GET',
    notes: 'List available models (optionally filtered by provider/capability).',
  });
}
