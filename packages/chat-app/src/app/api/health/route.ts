import { NextResponse } from 'next/server';

export async function GET(): Promise<Response> {
  return NextResponse.json(
    {
      ok: true,
      service: 'chat-app-api',
      status: 'healthy',
    },
    { status: 200 }
  );
}
