import type { DesktopApi } from '@shared/ipc-contract';

/**
 * Typed accessor for the API exposed via `window.api` by the preload script.
 * Throws a clear error if the bridge is missing (e.g. when running outside
 * Electron) so failures are easy to diagnose during development.
 */
export const desktopApi = (): DesktopApi => {
  if (typeof window === 'undefined' || window.api === undefined) {
    throw new Error('Desktop bridge unavailable: window.api is not defined.');
  }

  return window.api;
};
