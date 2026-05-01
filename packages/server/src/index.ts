/**
 * @ank1015/llm-server
 *
 * Hono-based HTTP server for the LLM platform.
 */

import { createApp } from './app.js';
import { getConfig, setConfig } from './core/config.js';
import { createHttpServer } from './http-server.js';

export type { AppConfig } from './core/config.js';
export { createApp };
export { createHttpServer };
export { getConfig };
export { setConfig };
export const app = createApp();
