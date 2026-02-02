import { notImplemented } from '@/lib/api/placeholder';

export async function GET(): Promise<Response> {
  return notImplemented('/api/keys', {
    method: 'GET',
    notes: 'List API key status by provider (redacted, no secret values).',
  });
}
