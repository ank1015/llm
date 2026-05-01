import { Value } from '@sinclair/typebox/value';

import type { Static, TSchema } from '@sinclair/typebox';
import type { Context } from 'hono';

type ValidationFailure = {
  ok: false;
  response: Response;
};

type ValidationSuccess<TSchemaValue> = {
  ok: true;
  value: TSchemaValue;
};

export type ValidationResult<TSchemaValue> = ValidationFailure | ValidationSuccess<TSchemaValue>;

export class RequestBodyError extends Error {
  readonly code: 'request_body_too_large';
  readonly status = 413;

  constructor(limitBytes: number) {
    super(`Request body must be ${limitBytes} bytes or smaller.`);
    this.name = 'RequestBodyError';
    this.code = 'request_body_too_large';
  }
}

export async function readJsonBody(
  c: Context,
  limitBytes = 16 * 1024 * 1024
): Promise<unknown | undefined> {
  const contentLength = c.req.header('Content-Length');
  if (contentLength) {
    const parsed = Number.parseInt(contentLength, 10);
    if (Number.isFinite(parsed) && parsed > limitBytes) {
      throw new RequestBodyError(limitBytes);
    }
  }

  const body = c.req.raw.body;
  if (!body) {
    return undefined;
  }

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    byteLength += value.byteLength;
    if (byteLength > limitBytes) {
      await reader.cancel().catch(() => undefined);
      throw new RequestBodyError(limitBytes);
    }

    chunks.push(value);
  }

  const buffer = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    buffer.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
  } catch {
    return undefined;
  }
}

export function validateSchema<T extends TSchema>(
  c: Context,
  schema: T,
  value: unknown,
  message: string
): ValidationResult<Static<T>> {
  if (!Value.Check(schema, value)) {
    return {
      ok: false,
      response: c.json({ error: message }, 400),
    };
  }

  return {
    ok: true,
    value: value as Static<T>,
  };
}
