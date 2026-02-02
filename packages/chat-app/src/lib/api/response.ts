import { NextResponse } from 'next/server';

type ErrorBody = {
  code: string;
  message: string;
};

export function apiError(status: number, error: ErrorBody): Response {
  return NextResponse.json(
    {
      ok: false,
      error,
    },
    { status }
  );
}
