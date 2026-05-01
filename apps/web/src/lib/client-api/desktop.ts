import { apiRequestJson, SERVER_BASE } from './http';

import type { DesktopFileDto, DesktopListResult } from '@ank1015/llm-server/contracts';

const DESKTOP_BASE = `${SERVER_BASE}/api/desktop`;

export type DesktopListInput = {
  path?: string;
  showHidden?: boolean;
};

export type DesktopFileInput = {
  path: string;
  maxBytes?: number;
};

export async function getDesktopListing(input?: DesktopListInput): Promise<DesktopListResult> {
  const params = new URLSearchParams();
  if (input?.path?.trim()) {
    params.set('path', input.path.trim());
  }
  if (input?.showHidden) {
    params.set('showHidden', 'true');
  }

  const query = params.toString();
  const url = `${DESKTOP_BASE}/list${query ? `?${query}` : ''}`;
  return apiRequestJson<DesktopListResult>(url, { method: 'GET' });
}

export async function getDesktopFile(input: DesktopFileInput): Promise<DesktopFileDto> {
  const params = new URLSearchParams({ path: input.path });
  if (typeof input.maxBytes === 'number' && Number.isFinite(input.maxBytes)) {
    params.set('maxBytes', `${Math.floor(input.maxBytes)}`);
  }

  return apiRequestJson<DesktopFileDto>(`${DESKTOP_BASE}/file?${params.toString()}`, {
    method: 'GET',
  });
}

export function getDesktopRawFileUrl(input: Pick<DesktopFileInput, 'path'>): string {
  const params = new URLSearchParams({ path: input.path });
  return `${DESKTOP_BASE}/file/raw?${params.toString()}`;
}
