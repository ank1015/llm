import { generateImage, getImageModel, getModel, stream } from '@ank1015/llm-core';

import type { GatewayAuth } from './auth/tokens.js';
import type { GatewayConfig } from './config.js';
import type { GatewayDatabase } from './db/index.js';
import type { RequestLog } from './logging/request-log.js';
import type { ProviderKeyVault } from './vault/provider-key-vault.js';

export interface GatewayRuntime {
  stream: typeof stream;
  generateImage: typeof generateImage;
  getModel: typeof getModel;
  getImageModel: typeof getImageModel;
}

export const gatewayRuntime: GatewayRuntime = {
  stream,
  generateImage,
  getModel,
  getImageModel,
};

export interface GatewayServices {
  config: GatewayConfig;
  db: GatewayDatabase;
  auth: GatewayAuth;
  requestLog: RequestLog;
  runtime: GatewayRuntime;
  vault: ProviderKeyVault;
}

export interface GatewayVariables {
  requestId: string;
  senderId: string;
  services: GatewayServices;
}

export type GatewayEnv = {
  Variables: GatewayVariables;
};
