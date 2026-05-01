import { serve } from '@hono/node-server';

import { createBackendApp } from './app.js';

import type { BackendInfo, BackendStatus } from '../shared/ipc-contract.js';
import type { ServerType } from '@hono/node-server';

export interface BackendController {
  readonly start: () => Promise<BackendInfo>;
  readonly stop: () => Promise<void>;
  readonly getInfo: () => BackendInfo;
}

interface ControllerState {
  status: BackendStatus;
  url: string | null;
  port: number | null;
  error: string | undefined;
  server: ServerType | null;
}

const initialState: ControllerState = {
  status: 'idle',
  url: null,
  port: null,
  error: undefined,
  server: null,
};

/**
 * Create a controller for the embedded Hono backend. The server binds to an
 * OS-assigned port on `127.0.0.1` so the renderer can reach it without exposing
 * the API to the local network.
 */
export const createBackendController = (): BackendController => {
  const state: ControllerState = { ...initialState };

  const toInfo = (): BackendInfo => {
    const base = {
      status: state.status,
      url: state.url,
      port: state.port,
    } as const;

    return state.error === undefined ? base : { ...base, error: state.error };
  };

  return {
    getInfo: toInfo,

    start: async () => {
      if (state.status === 'running' || state.status === 'starting') {
        return toInfo();
      }

      state.status = 'starting';
      state.error = undefined;

      const app = createBackendApp();

      const server = await new Promise<ServerType>((resolveServer, rejectServer) => {
        try {
          const created = serve(
            { fetch: app.fetch, hostname: '127.0.0.1', port: 0 },
            (addressInfo) => {
              state.port = addressInfo.port;
              state.url = `http://127.0.0.1:${String(addressInfo.port)}`;
              state.status = 'running';
              resolveServer(created);
            }
          );
        } catch (error) {
          rejectServer(error);
        }
      }).catch((error: unknown) => {
        state.status = 'error';
        state.error = error instanceof Error ? error.message : 'Failed to start backend.';

        return null;
      });

      state.server = server;

      return toInfo();
    },

    stop: async () => {
      if (state.server === null) {
        state.status = 'stopped';

        return;
      }

      state.status = 'stopping';
      const server = state.server;
      state.server = null;

      await new Promise<void>((resolveStop) => {
        server.close(() => {
          resolveStop();
        });
      });

      state.status = 'stopped';
      state.url = null;
      state.port = null;
    },
  };
};
