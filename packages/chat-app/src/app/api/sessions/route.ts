import { notImplemented } from '@/lib/api/placeholder';

export async function GET(): Promise<Response> {
  return notImplemented('/api/sessions', {
    method: 'GET',
    notes: 'List sessions for the active project with pagination/search.',
  });
}

export async function POST(): Promise<Response> {
  return notImplemented('/api/sessions', {
    method: 'POST',
    notes: 'Create a new chat session.',
  });
}
