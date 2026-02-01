/**
 * @ank1015/llm-server
 *
 * HTTP server for LLM SDK built with Hono.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Services
export { KeyService, DbService } from './services/index.js';

// Routes
import { messagesRoutes, keysRoutes } from './routes/index.js';

export const app = new Hono();

// Enable CORS for dashboard
app.use('*', cors());

// Health check endpoint
app.get('/health', (c) => {
  return c.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Mount routes
app.route('/messages', messagesRoutes);
app.route('/keys', keysRoutes);

// Default export for direct execution
export default app;
