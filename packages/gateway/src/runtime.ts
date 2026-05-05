import { createGatewayAuth } from './auth/tokens.js';
import { getGatewayConfig } from './config.js';
import { gatewayRuntime } from './context.js';
import { createGatewayDatabase } from './db/index.js';
import { createRequestLog } from './logging/request-log.js';
import { createInMemoryRateLimiter } from './rate-limit.js';
import { createProviderKeyVault } from './vault/provider-key-vault.js';

import type { GatewayConfigInput } from './config.js';
import type { GatewayServices } from './context.js';

export function createGatewayServices(
  configInput: Partial<GatewayConfigInput> = {}
): GatewayServices {
  const config = getGatewayConfig(configInput);
  const db = createGatewayDatabase(config);

  return {
    config,
    db,
    auth: createGatewayAuth(db, config),
    rateLimiter: createInMemoryRateLimiter(config),
    requestLog: createRequestLog(db, config.logMode, config.logEvents),
    runtime: gatewayRuntime,
    vault: createProviderKeyVault(db, config),
  };
}
