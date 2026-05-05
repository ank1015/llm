import { Hono } from 'hono';

import { getDesktopContext, updateDesktopContext } from '../services/desktop-context-service.js';
import {
  createDesktopFolder,
  DesktopRouteError,
  getDesktopFile,
  getDesktopListing,
  getRawDesktopFile,
  parseMaxBytes,
  renameDesktopEntry,
} from '../services/desktop-files-service.js';

import type {
  DesktopContextUpdate,
  DesktopCreateFolderRequest,
  DesktopRenameEntryRequest,
} from '../../shared/api-contract.js';
import type { Context } from 'hono';

const INVALID_JSON_MESSAGE = 'Request body must be valid JSON.';

export const desktopRoute = new Hono()
  .get('/list', async (c) => {
    try {
      const showHidden = c.req.query('showHidden') === 'true' || c.req.query('showHidden') === '1';
      const listing = await getDesktopListing(c.req.query('path'), showHidden);

      return c.json(listing);
    } catch (error) {
      return desktopErrorResponse(c, error);
    }
  })
  .get('/file', async (c) => {
    try {
      const file = await getDesktopFile(
        c.req.query('path'),
        parseMaxBytes(c.req.query('maxBytes'))
      );

      return c.json(file);
    } catch (error) {
      return desktopErrorResponse(c, error);
    }
  })
  .get('/file/raw', async (c) => {
    try {
      const file = await getRawDesktopFile(c.req.query('path'));

      return new Response(file.content, {
        status: 200,
        headers: {
          'Content-Type': file.contentType,
          'Content-Length': String(file.content.byteLength),
          'Cache-Control': 'no-store',
        },
      });
    } catch (error) {
      return desktopErrorResponse(c, error);
    }
  })
  .get('/context', (c) => c.json(getDesktopContext()))
  .post('/folder', async (c) => {
    let payload: unknown;

    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: INVALID_JSON_MESSAGE }, 400);
    }

    if (!isDesktopCreateFolderRequest(payload)) {
      return c.json({ error: 'Invalid create folder payload.' }, 400);
    }

    try {
      return c.json(await createDesktopFolder(payload.directoryPath));
    } catch (error) {
      return desktopErrorResponse(c, error);
    }
  })
  .post('/entry/rename', async (c) => {
    let payload: unknown;

    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: INVALID_JSON_MESSAGE }, 400);
    }

    if (!isDesktopRenameEntryRequest(payload)) {
      return c.json({ error: 'Invalid rename payload.' }, 400);
    }

    try {
      return c.json(await renameDesktopEntry(payload.path, payload.newName));
    } catch (error) {
      return desktopErrorResponse(c, error);
    }
  })
  .post('/context', async (c) => {
    let payload: unknown;

    try {
      payload = await c.req.json();
    } catch {
      return c.json({ error: INVALID_JSON_MESSAGE }, 400);
    }

    if (!isDesktopContextUpdate(payload)) {
      return c.json({ error: 'Invalid desktop context payload.' }, 400);
    }

    return c.json(updateDesktopContext(payload));
  });

const desktopErrorResponse = (c: Context, error: unknown): Response => {
  if (error instanceof DesktopRouteError) {
    return jsonError(error.message, error.statusCode);
  }

  return c.json({ error: 'Unexpected desktop API error' }, 500);
};

const jsonError = (message: string, status: number): Response =>
  new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });

const isDesktopContextUpdate = (value: unknown): value is DesktopContextUpdate => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;
  const currentDirectory = record['currentDirectory'];
  const activeFilePath = record['activeFilePath'];
  const openFiles = record['openFiles'];

  return (
    (typeof currentDirectory === 'string' || currentDirectory === null) &&
    (typeof activeFilePath === 'string' || activeFilePath === null) &&
    Array.isArray(openFiles)
  );
};

const isDesktopCreateFolderRequest = (value: unknown): value is DesktopCreateFolderRequest => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return typeof record['directoryPath'] === 'string';
};

const isDesktopRenameEntryRequest = (value: unknown): value is DesktopRenameEntryRequest => {
  if (typeof value !== 'object' || value === null) {
    return false;
  }

  const record = value as Record<string, unknown>;

  return typeof record['path'] === 'string' && typeof record['newName'] === 'string';
};
