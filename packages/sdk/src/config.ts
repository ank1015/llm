import { homedir } from 'node:os';
import { join } from 'node:path';

export interface SdkConfig {
  keysFilePath: string;
  sessionsBaseDir: string;
}

export const DEFAULT_KEYS_FILE_PATH = join(homedir(), '.llm-sdk', 'keys.env');
export const DEFAULT_SESSIONS_BASE_DIR = join(homedir(), '.llm-sdk', 'sessions');

export const DEFAULT_SDK_CONFIG: SdkConfig = {
  keysFilePath: DEFAULT_KEYS_FILE_PATH,
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
