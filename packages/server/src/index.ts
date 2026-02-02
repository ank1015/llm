/**
 * @ank1015/llm-server
 *
 * HTTP server for LLM SDK built with Hono.
 */

import { Hono } from 'hono';
import { cors } from 'hono/cors';

// Routes
import { messagesRoutes, keysRoutes, usagesRoutes } from './routes/index.js';

// Services
export { KeyService, DbService, SessionService } from './services/index.js';

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
app.route('/usages', usagesRoutes);

// Default export for direct execution
export default app;
