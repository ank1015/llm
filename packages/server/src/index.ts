/**
 * @ank1015/llm-server
 *
 * Hono-based HTTP server for the LLM platform.
 */

import { createApp } from './app.js';
import { createHttpServer } from './http-server.js';

export { createApp };
export { createHttpServer };
export const app = createApp();
