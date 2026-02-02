/**
 * Sessions routes
 *
 * Endpoints for managing session files (JSONL-based conversation trees).
 */

import { InvalidRequestError, isValidApi, LLMError } from '@ank1015/llm-types';
import { Hono } from 'hono';

import { SessionService } from '../services/index.js';

import type { Api, Message } from '@ank1015/llm-types';

const app = new Hono();

/**
 * GET /sessions/projects
 *
 * List all projects.
 */
app.get('/projects', (c) => {
  const projects = SessionService.listProjects();
  return c.json({
    projects,
    count: projects.length,
  });
});

/**
 * GET /sessions/:projectName
 *
 * List sessions in a project.
 * Query params:
 * - path: Path within project (optional, defaults to root)
 */
app.get('/:projectName', (c) => {
  const projectName = c.req.param('projectName');
  const path = c.req.query('path') ?? '';

  const sessions = SessionService.listSessions(projectName, path);

  return c.json({
    projectName,
    path,
    sessions,
    count: sessions.length,
  });
});

/**
 * GET /sessions/:projectName/search
 *
 * Search sessions by name.
 * Query params:
 * - path: Path within project (optional)
 * - q: Search query (required)
 */
app.get('/:projectName/search', (c) => {
  const projectName = c.req.param('projectName');
  const path = c.req.query('path') ?? '';
  const query = c.req.query('q');

  if (!query) {
    const error = new InvalidRequestError('Search query (q) is required');
    return c.json(error.toResponse(), 400);
  }

  const sessions = SessionService.searchSessions(projectName, path, query);

  return c.json({
    projectName,
    path,
    query,
    sessions,
    count: sessions.length,
  });
});

/**
 * POST /sessions/:projectName
 *
 * Create a new session.
 * Query params:
 * - path: Path within project (optional)
 * Body:
 * - sessionName: Optional session name
 */
app.post('/:projectName', async (c) => {
  try {
    const projectName = c.req.param('projectName');
    const path = c.req.query('path') ?? '';

    let sessionName: string | undefined;

    // Body is optional
    const contentType = c.req.header('content-type');
    if (contentType?.includes('application/json')) {
      const body = await c.req.json();
      if (body && typeof body === 'object' && 'sessionName' in body) {
        sessionName = body.sessionName as string;
      }
    }

    const { sessionId, header } = SessionService.createSession(projectName, path, sessionName);

    return c.json(
      {
        success: true,
        sessionId,
        header,
        location: { projectName, path, sessionId },
      },
      201
    );
  } catch (error) {
    if (error instanceof LLMError) {
      return c.json(error.toResponse(), error.statusCode as 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    const internalError = new InvalidRequestError(message);
    return c.json(internalError.toResponse(), 400);
  }
});

/**
 * GET /sessions/:projectName/:sessionId
 *
 * Get a session with all nodes.
 * Query params:
 * - path: Path within project (optional)
 */
// eslint-disable-next-line sonarjs/no-duplicate-string
app.get('/:projectName/:sessionId', (c) => {
  const projectName = c.req.param('projectName');
  const sessionId = c.req.param('sessionId');
  const path = c.req.query('path') ?? '';

  // Exclude special routes that have their own handlers
  if (sessionId === 'projects' || sessionId === 'search') {
    return c.notFound();
  }

  const session = SessionService.getSession(projectName, path, sessionId);

  if (!session) {
    return c.json(
      {
        error: true,
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
        details: { projectName, path, sessionId },
      },
      404
    );
  }

  return c.json(session);
});

/**
 * DELETE /sessions/:projectName/:sessionId
 *
 * Delete a session.
 * Query params:
 * - path: Path within project (optional)
 */
app.delete('/:projectName/:sessionId', (c) => {
  const projectName = c.req.param('projectName');
  const sessionId = c.req.param('sessionId');
  const path = c.req.query('path') ?? '';

  const deleted = SessionService.deleteSession(projectName, path, sessionId);

  if (!deleted) {
    return c.json(
      {
        error: true,
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
        details: { projectName, path, sessionId },
      },
      404
    );
  }

  return c.json({
    success: true,
    message: `Session ${sessionId} has been deleted`,
    location: { projectName, path, sessionId },
  });
});

/**
 * PATCH /sessions/:projectName/:sessionId
 *
 * Update session name.
 * Query params:
 * - path: Path within project (optional)
 * Body:
 * - sessionName: New session name (required)
 */
app.patch('/:projectName/:sessionId', async (c) => {
  try {
    const projectName = c.req.param('projectName');
    const sessionId = c.req.param('sessionId');
    const path = c.req.query('path') ?? '';

    const body = await c.req.json();

    if (!body || typeof body !== 'object') {
      // eslint-disable-next-line sonarjs/no-duplicate-string
      throw new InvalidRequestError('Request body is required');
    }

    const { sessionName } = body as { sessionName?: string };

    if (!sessionName || typeof sessionName !== 'string') {
      throw new InvalidRequestError('sessionName is required and must be a string');
    }

    const header = SessionService.updateSessionName(projectName, path, sessionId, sessionName);

    if (!header) {
      return c.json(
        {
          error: true,
          code: 'SESSION_NOT_FOUND',
          message: `Session not found: ${sessionId}`,
          details: { projectName, path, sessionId },
        },
        404
      );
    }

    return c.json({
      success: true,
      header,
      location: { projectName, path, sessionId },
    });
  } catch (error) {
    if (error instanceof LLMError) {
      return c.json(error.toResponse(), error.statusCode as 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    const internalError = new InvalidRequestError(message);
    return c.json(internalError.toResponse(), 400);
  }
});

/**
 * POST /sessions/:projectName/:sessionId/messages
 *
 * Append a message node to a session.
 * Query params:
 * - path: Path within project (optional)
 * Body:
 * - parentId: Parent node ID (required)
 * - branch: Branch name (required)
 * - message: Message object (required)
 * - api: API provider (required)
 * - modelId: Model ID (required)
 * - providerOptions: Provider options (optional)
 */
app.post('/:projectName/:sessionId/messages', async (c) => {
  try {
    const projectName = c.req.param('projectName');
    const sessionId = c.req.param('sessionId');
    const path = c.req.query('path') ?? '';

    const body = await c.req.json();

    if (!body || typeof body !== 'object') {
      throw new InvalidRequestError('Request body is required');
    }

    const { parentId, branch, message, api, modelId, providerOptions } = body as {
      parentId?: string;
      branch?: string;
      message?: Message;
      api?: string;
      modelId?: string;
      providerOptions?: Record<string, unknown>;
    };

    if (!parentId || typeof parentId !== 'string') {
      throw new InvalidRequestError('parentId is required and must be a string');
    }

    if (!branch || typeof branch !== 'string') {
      throw new InvalidRequestError('branch is required and must be a string');
    }

    if (!message || typeof message !== 'object') {
      throw new InvalidRequestError('message is required and must be an object');
    }

    if (!api || typeof api !== 'string') {
      throw new InvalidRequestError('api is required and must be a string');
    }

    if (!isValidApi(api)) {
      throw new InvalidRequestError(`Invalid API provider: ${api}`, { api });
    }

    if (!modelId || typeof modelId !== 'string') {
      throw new InvalidRequestError('modelId is required and must be a string');
    }

    const result = SessionService.appendMessage(
      projectName,
      path,
      sessionId,
      parentId,
      branch,
      message,
      api as Api,
      modelId,
      providerOptions
    );

    return c.json(
      {
        success: true,
        sessionId: result.sessionId,
        node: result.node,
        location: { projectName, path, sessionId: result.sessionId },
      },
      201
    );
  } catch (error) {
    if (error instanceof LLMError) {
      return c.json(error.toResponse(), error.statusCode as 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    const internalError = new InvalidRequestError(message);
    return c.json(internalError.toResponse(), 400);
  }
});

/**
 * POST /sessions/:projectName/:sessionId/custom
 *
 * Append a custom node to a session.
 * Query params:
 * - path: Path within project (optional)
 * Body:
 * - parentId: Parent node ID (required)
 * - branch: Branch name (required)
 * - payload: Custom payload (required)
 */
app.post('/:projectName/:sessionId/custom', async (c) => {
  try {
    const projectName = c.req.param('projectName');
    const sessionId = c.req.param('sessionId');
    const path = c.req.query('path') ?? '';

    const body = await c.req.json();

    if (!body || typeof body !== 'object') {
      throw new InvalidRequestError('Request body is required');
    }

    const { parentId, branch, payload } = body as {
      parentId?: string;
      branch?: string;
      payload?: Record<string, unknown>;
    };

    if (!parentId || typeof parentId !== 'string') {
      throw new InvalidRequestError('parentId is required and must be a string');
    }

    if (!branch || typeof branch !== 'string') {
      throw new InvalidRequestError('branch is required and must be a string');
    }

    if (!payload || typeof payload !== 'object') {
      throw new InvalidRequestError('payload is required and must be an object');
    }

    const node = SessionService.appendCustom(
      projectName,
      path,
      sessionId,
      parentId,
      branch,
      payload
    );

    if (!node) {
      return c.json(
        {
          error: true,
          code: 'SESSION_NOT_FOUND',
          message: `Session not found: ${sessionId}`,
          details: { projectName, path, sessionId },
        },
        404
      );
    }

    return c.json(
      {
        success: true,
        node,
        location: { projectName, path, sessionId },
      },
      201
    );
  } catch (error) {
    if (error instanceof LLMError) {
      return c.json(error.toResponse(), error.statusCode as 400);
    }
    const message = error instanceof Error ? error.message : String(error);
    const internalError = new InvalidRequestError(message);
    return c.json(internalError.toResponse(), 400);
  }
});

/**
 * GET /sessions/:projectName/:sessionId/branches
 *
 * Get branch information for a session.
 * Query params:
 * - path: Path within project (optional)
 */
app.get('/:projectName/:sessionId/branches', (c) => {
  const projectName = c.req.param('projectName');
  const sessionId = c.req.param('sessionId');
  const path = c.req.query('path') ?? '';

  const branches = SessionService.getBranches(projectName, path, sessionId);

  if (!branches) {
    return c.json(
      {
        error: true,
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
        details: { projectName, path, sessionId },
      },
      404
    );
  }

  return c.json({
    sessionId,
    branches,
    count: branches.length,
  });
});

/**
 * GET /sessions/:projectName/:sessionId/history/:branch
 *
 * Get the linear history of a branch.
 * Query params:
 * - path: Path within project (optional)
 */
app.get('/:projectName/:sessionId/history/:branch', (c) => {
  const projectName = c.req.param('projectName');
  const sessionId = c.req.param('sessionId');
  const branch = c.req.param('branch');
  const path = c.req.query('path') ?? '';

  const history = SessionService.getBranchHistory(projectName, path, sessionId, branch);

  if (!history) {
    return c.json(
      {
        error: true,
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
        details: { projectName, path, sessionId },
      },
      404
    );
  }

  return c.json({
    sessionId,
    branch,
    history,
    count: history.length,
  });
});

/**
 * GET /sessions/:projectName/:sessionId/nodes/:nodeId
 *
 * Get a specific node by ID.
 * Query params:
 * - path: Path within project (optional)
 */
app.get('/:projectName/:sessionId/nodes/:nodeId', (c) => {
  const projectName = c.req.param('projectName');
  const sessionId = c.req.param('sessionId');
  const nodeId = c.req.param('nodeId');
  const path = c.req.query('path') ?? '';

  const node = SessionService.getNode(projectName, path, sessionId, nodeId);

  if (!node) {
    return c.json(
      {
        error: true,
        code: 'NODE_NOT_FOUND',
        message: `Node not found: ${nodeId}`,
        details: { projectName, path, sessionId, nodeId },
      },
      404
    );
  }

  return c.json(node);
});

/**
 * GET /sessions/:projectName/:sessionId/latest
 *
 * Get the latest node in a session or branch.
 * Query params:
 * - path: Path within project (optional)
 * - branch: Branch name (optional - returns absolute latest if not provided)
 */
app.get('/:projectName/:sessionId/latest', (c) => {
  const projectName = c.req.param('projectName');
  const sessionId = c.req.param('sessionId');
  const path = c.req.query('path') ?? '';
  const branch = c.req.query('branch');

  const node = SessionService.getLatestNode(projectName, path, sessionId, branch);

  if (!node) {
    return c.json(
      {
        error: true,
        code: 'SESSION_NOT_FOUND',
        message: `Session not found or empty: ${sessionId}`,
        details: { projectName, path, sessionId, branch },
      },
      404
    );
  }

  return c.json({
    sessionId,
    branch: branch ?? node.branch,
    node,
  });
});

/**
 * GET /sessions/:projectName/:sessionId/messages
 *
 * Get all message nodes from a session.
 * Query params:
 * - path: Path within project (optional)
 * - branch: Branch name (optional - returns all messages if not provided)
 */
app.get('/:projectName/:sessionId/messages', (c) => {
  const projectName = c.req.param('projectName');
  const sessionId = c.req.param('sessionId');
  const path = c.req.query('path') ?? '';
  const branch = c.req.query('branch');

  const messages = SessionService.getMessages(projectName, path, sessionId, branch);

  if (!messages) {
    return c.json(
      {
        error: true,
        code: 'SESSION_NOT_FOUND',
        message: `Session not found: ${sessionId}`,
        details: { projectName, path, sessionId },
      },
      404
    );
  }

  return c.json({
    sessionId,
    branch: branch ?? null,
    messages,
    count: messages.length,
  });
});

export { app as sessionsRoutes };
