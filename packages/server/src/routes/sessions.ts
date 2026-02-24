import { Hono } from 'hono';

import { Session } from '../core/index.js';

const BASE = '/projects/:projectId/artifacts/:artifactDirId/sessions';

export const sessionRoutes = new Hono();

/** POST /api/.../sessions — Create a new session */
sessionRoutes.post(BASE, async (c) => {
  const { projectId, artifactDirId } = c.req.param();
  const body = await c.req.json<{ name?: string; modelId: string; api: string }>();

  if (!body.modelId || !body.api) {
    return c.json({ error: 'modelId and api are required' }, 400);
  }

  try {
    const session = await Session.create(projectId, artifactDirId, body);
    const metadata = await session.getMetadata();
    return c.json(metadata, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create session';
    return c.json({ error: message }, 500);
  }
});

/** GET /api/.../sessions — List sessions */
sessionRoutes.get(BASE, async (c) => {
  const { projectId, artifactDirId } = c.req.param();

  try {
    const sessions = await Session.list(projectId, artifactDirId);
    return c.json(sessions);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to list sessions';
    return c.json({ error: message }, 500);
  }
});

/** GET /api/.../sessions/:sessionId — Get session metadata */
sessionRoutes.get(`${BASE}/:sessionId`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    const metadata = await session.getMetadata();
    return c.json(metadata);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Session not found';
    return c.json({ error: message }, 404);
  }
});

/** GET /api/.../sessions/:sessionId/messages — Get message history */
sessionRoutes.get(`${BASE}/:sessionId/messages`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    const messages = await session.getHistory();
    return c.json(messages);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Session not found';
    return c.json({ error: message }, 404);
  }
});

/** POST /api/.../sessions/:sessionId/prompt — Send a message */
sessionRoutes.post(`${BASE}/:sessionId/prompt`, async (c) => {
  const { projectId, artifactDirId, sessionId } = c.req.param();
  const body = await c.req.json<{ message: string }>();

  if (!body.message) {
    return c.json({ error: 'message is required' }, 400);
  }

  try {
    const session = await Session.getById(projectId, artifactDirId, sessionId);
    const newMessages = await session.prompt(body);
    return c.json(newMessages);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to prompt session';
    return c.json({ error: message }, 500);
  }
});
