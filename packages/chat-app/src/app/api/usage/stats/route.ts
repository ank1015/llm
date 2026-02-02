import { notImplemented } from '@/lib/api/placeholder';

export async function GET(): Promise<Response> {
  return notImplemented('/api/usage/stats', {
    method: 'GET',
    notes: 'Get usage aggregates (cost/tokens/messages) for charts and limits.',
  });
}
