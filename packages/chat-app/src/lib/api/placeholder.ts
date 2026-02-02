import { NextResponse } from 'next/server';

type PlaceholderOptions = {
  method: string;
  notes?: string;
};

export function notImplemented(route: string, options: PlaceholderOptions): Response {
  return NextResponse.json(
    {
      ok: false,
      error: {
        code: 'NOT_IMPLEMENTED',
        message: 'Route scaffolded but business logic is not implemented yet.',
      },
      route,
      method: options.method,
      notes: options.notes ?? null,
    },
    { status: 501 }
  );
}
