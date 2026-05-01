import {
  ApiRoutes,
  type DesktopContextDto,
  type DesktopContextUpdate,
  type DesktopCreateFolderRequest,
  type DesktopFileDto,
  type DesktopListResult,
  type DesktopRenameEntryRequest,
  type DesktopEntryDto,
  type EchoRequestBody,
  type EchoResponse,
  type HealthResponse,
} from '@shared/api-contract';

import { desktopApi } from './desktop-bridge';

/**
 * Minimal HTTP client that talks to the embedded Hono backend over its
 * loopback URL. The base URL is fetched once via the IPC bridge so we never
 * hard-code a port.
 */
let cachedBaseUrl: string | null = null;

const resolveBaseUrl = async (): Promise<string> => {
  if (cachedBaseUrl !== null) {
    return cachedBaseUrl;
  }

  const info = await desktopApi().getBackendStatus();

  if (info.url === null) {
    throw new Error(`Backend not available (status: ${info.status}).`);
  }

  cachedBaseUrl = info.url;

  return info.url;
};

export const fetchHealth = async (): Promise<HealthResponse> => {
  const base = await resolveBaseUrl();
  const response = await fetch(`${base}${ApiRoutes.Health}`);

  if (!response.ok) {
    throw new Error(`Health check failed: HTTP ${String(response.status)}`);
  }

  return (await response.json()) as HealthResponse;
};

export const sendEcho = async (message: string): Promise<EchoResponse> => {
  const base = await resolveBaseUrl();
  const body: EchoRequestBody = { message };
  const response = await fetch(`${base}${ApiRoutes.Echo}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`Echo failed: HTTP ${String(response.status)}`);
  }

  return (await response.json()) as EchoResponse;
};

export const getDesktopListing = async (input?: {
  readonly path?: string;
  readonly showHidden?: boolean;
}): Promise<DesktopListResult> => {
  const base = await resolveBaseUrl();
  const params = new URLSearchParams();

  if (input?.path?.trim()) {
    params.set('path', input.path.trim());
  }
  if (input?.showHidden) {
    params.set('showHidden', 'true');
  }

  const query = params.toString();
  const response = await fetch(`${base}${ApiRoutes.DesktopList}${query ? `?${query}` : ''}`);

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, 'Desktop listing failed.'));
  }

  return (await response.json()) as DesktopListResult;
};

export const getDesktopFile = async (input: {
  readonly path: string;
  readonly maxBytes?: number;
}): Promise<DesktopFileDto> => {
  const base = await resolveBaseUrl();
  const params = new URLSearchParams({ path: input.path });

  if (typeof input.maxBytes === 'number' && Number.isFinite(input.maxBytes)) {
    params.set('maxBytes', String(Math.floor(input.maxBytes)));
  }

  const response = await fetch(`${base}${ApiRoutes.DesktopFile}?${params.toString()}`);

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, 'Desktop file failed.'));
  }

  return (await response.json()) as DesktopFileDto;
};

export const getDesktopRawFileUrl = async (path: string): Promise<string> => {
  const base = await resolveBaseUrl();
  const params = new URLSearchParams({ path });

  return `${base}${ApiRoutes.DesktopRawFile}?${params.toString()}`;
};

export const updateDesktopContext = async (
  update: DesktopContextUpdate
): Promise<DesktopContextDto> => {
  const base = await resolveBaseUrl();
  const response = await fetch(`${base}${ApiRoutes.DesktopContext}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(update),
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, 'Desktop context update failed.'));
  }

  return (await response.json()) as DesktopContextDto;
};

export const createDesktopFolder = async (
  input: DesktopCreateFolderRequest
): Promise<DesktopEntryDto> => {
  const base = await resolveBaseUrl();
  const response = await fetch(`${base}${ApiRoutes.DesktopCreateFolder}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, 'Create folder failed.'));
  }

  return (await response.json()) as DesktopEntryDto;
};

export const renameDesktopEntry = async (
  input: DesktopRenameEntryRequest
): Promise<DesktopEntryDto> => {
  const base = await resolveBaseUrl();
  const response = await fetch(`${base}${ApiRoutes.DesktopRenameEntry}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  if (!response.ok) {
    throw new Error(await getApiErrorMessage(response, 'Rename failed.'));
  }

  return (await response.json()) as DesktopEntryDto;
};

export const trashDesktopEntry = async (path: string): Promise<void> => {
  await desktopApi().trashDesktopEntry(path);
};

const getApiErrorMessage = async (response: Response, fallback: string): Promise<string> => {
  try {
    const payload = (await response.json()) as { readonly error?: unknown };

    if (typeof payload.error === 'string') {
      return payload.error;
    }
  } catch {
    return fallback;
  }

  return fallback;
};
