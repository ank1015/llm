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

export async function readJsonBody(c: Context): Promise<unknown | undefined> {
  return c.req.json().catch(() => undefined);
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
