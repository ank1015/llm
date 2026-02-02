import { notImplemented } from '@/lib/api/placeholder';

export async function GET(): Promise<Response> {
  return notImplemented('/api/usage/messages', {
    method: 'GET',
    notes: 'Get per-message usage records with filtering.',
  });
}
