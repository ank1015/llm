export type EmbeddedServerStatus = 'idle' | 'starting' | 'running' | 'stopping' | 'stopped';

export type RuntimeInfo = {
  readonly appVersion: string;
  readonly electronVersion: string;
  readonly server: {
    readonly status: EmbeddedServerStatus;
    readonly url: string | null;
  };
};

export type Theme = 'light' | 'dark';
