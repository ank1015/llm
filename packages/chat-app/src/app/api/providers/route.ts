import { notImplemented } from '@/lib/api/placeholder';

export async function GET(): Promise<Response> {
  return notImplemented('/api/providers', {
    method: 'GET',
    notes: 'List providers with availability and API key status.',
  });
}
