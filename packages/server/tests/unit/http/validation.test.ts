import { Hono } from 'hono';
import { Type } from '@sinclair/typebox';
import { describe, expect, it } from 'vitest';

import { readJsonBody, validateSchema } from '../../../src/http/validation.js';

const BodySchema = Type.Object({
  value: Type.String(),
});

describe('http/validation', () => {
  it('reads valid json bodies and returns undefined for invalid json', async () => {
    const app = new Hono();

    app.post('/json', async (c) => {
      const body = await readJsonBody(c);
      return c.json({ body });
    });

    const validResponse = await app.request('/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'ok' }),
    });
    expect(validResponse.status).toBe(200);
    expect(await validResponse.json()).toEqual({
      body: { value: 'ok' },
    });

    const invalidResponse = await app.request('/json', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{not-json',
    });
    expect(invalidResponse.status).toBe(200);
    expect(await invalidResponse.json()).toEqual({});
  });

  it('returns a 400 response when schema validation fails', async () => {
    const app = new Hono();

    app.post('/validate', async (c) => {
      const body = await readJsonBody(c);
      const validation = validateSchema(c, BodySchema, body, 'Invalid test body');
      if (!validation.ok) {
        return validation.response;
      }

      return c.json(validation.value);
    });

    const invalidResponse = await app.request('/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 123 }),
    });
    expect(invalidResponse.status).toBe(400);
    expect(await invalidResponse.json()).toEqual({
      error: 'Invalid test body',
    });

    const validResponse = await app.request('/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ value: 'ok' }),
    });
    expect(validResponse.status).toBe(200);
    expect(await validResponse.json()).toEqual({
      value: 'ok',
    });
  });
});
