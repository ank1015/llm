import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SdkConfig {
  gatewayCredentialsPath: string;
  keysFilePath: string;
  modelTransport: SdkModelTransport;
  sessionsBaseDir: string;
}

export type SdkModelTransport = 'auto' | 'direct' | 'gateway';

export const DEFAULT_KEYS_FILE_PATH = join(homedir(), '.llm-sdk', 'keys.env');
export const DEFAULT_GATEWAY_CREDENTIALS_PATH = join(homedir(), '.llm', 'gateway.json');
export const DEFAULT_SESSIONS_BASE_DIR = join(homedir(), '.llm-sdk', 'sessions');

export const DEFAULT_SDK_CONFIG: SdkConfig = {
  gatewayCredentialsPath: DEFAULT_GATEWAY_CREDENTIALS_PATH,
  keysFilePath: DEFAULT_KEYS_FILE_PATH,
  modelTransport: 'auto',
  sessionsBaseDir: DEFAULT_SESSIONS_BASE_DIR,
};

let sdkConfig: SdkConfig = { ...DEFAULT_SDK_CONFIG };

export function getSdkConfig(): SdkConfig {
  return { ...sdkConfig };
}

export function setSdkConfig(config: Partial<SdkConfig>): SdkConfig {
  sdkConfig = {
    ...sdkConfig,
    ...config,
  };

  return getSdkConfig();
}

export function resetSdkConfig(): SdkConfig {
  sdkConfig = { ...DEFAULT_SDK_CONFIG };
  return getSdkConfig();
}
