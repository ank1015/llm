import { apiRequestJson, SERVER_BASE } from './http';

import type { DesktopListResult } from '@ank1015/llm-server/contracts';

const DESKTOP_BASE = `${SERVER_BASE}/api/desktop`;

export type DesktopListInput = {
  path?: string;
  showHidden?: boolean;
};

export async function getDesktopListing(
  input?: DesktopListInput
): Promise<DesktopListResult> {
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
