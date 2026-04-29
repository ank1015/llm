import type { EmbeddedServerStatus } from '../../shared/desktop-api.js';

export type EmbeddedServerState = {
  readonly status: EmbeddedServerStatus;
  readonly url: string | null;
};

export type EmbeddedServerController = {
  readonly getState: () => EmbeddedServerState;
  readonly stop: () => Promise<void>;
};

export const createEmbeddedServerController = (): EmbeddedServerController => {
  let state: EmbeddedServerState = {
    status: 'idle',
    url: null,
  };

  return {
    getState: () => state,
    stop: async () => {
      state = {
        status: 'stopped',
        url: null,
      };
    },
  };
};
