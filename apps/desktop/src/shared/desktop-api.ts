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

export type GatewayCredentials = {
  readonly gatewayBaseUrl: string;
  readonly accessToken: string;
  readonly accessTokenExpiresAt?: number;
  readonly refreshToken: string;
  readonly refreshTokenExpiresAt?: number;
  readonly refreshTokenId?: string;
  readonly savedAt: string;
};

export type GatewaySession = {
  readonly authenticated: boolean;
  readonly credentialsPath: string;
  readonly gatewayBaseUrl: string;
  readonly savedAt?: string;
  readonly accessTokenExpiresAt?: number;
  readonly refreshTokenExpiresAt?: number;
};

export type GatewayLoginResult =
  | {
      readonly ok: true;
      readonly session: GatewaySession;
    }
  | {
      readonly ok: false;
      readonly message: string;
      readonly session: GatewaySession;
    };

export type SetupCheckName = 'node' | 'npx' | 'python' | 'git' | 'chrome-controller';

export type SetupCheck = {
  readonly name: SetupCheckName;
  readonly label: string;
  readonly command: string;
  readonly installed: boolean;
  readonly version?: string;
  readonly executablePath?: string;
};
