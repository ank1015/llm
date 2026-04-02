import { Hono } from 'hono';
import { cors } from 'hono/cors';

import { artifactDirRoutes } from './routes/artifact-dirs.js';
import { checkpointRoutes } from './routes/checkpoints.js';
import { keyRoutes } from './routes/keys.js';
import { modelRoutes } from './routes/models.js';
import { projectRoutes } from './routes/projects.js';
import { sessionRoutes } from './routes/sessions.js';
import { skillRoutes } from './routes/skills.js';
import { terminalRoutes } from './routes/terminals.js';

/**
 * Creates and configures the Hono application.
 */
export function createApp(): Hono {
  const app = new Hono();
  const corsOrigin = process.env['CORS_ORIGIN']?.trim() || '*';

  app.use(
    '/api/*',
    cors({
      origin: corsOrigin,
      allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    })
  );

  app.get('/health', (c) => {
    return c.json({ status: 'ok' });
  });

  app.route('/api', projectRoutes);
  app.route('/api', artifactDirRoutes);
  app.route('/api', checkpointRoutes);
  app.route('/api', keyRoutes);
  app.route('/api', modelRoutes);
  app.route('/api', sessionRoutes);
  app.route('/api', skillRoutes);
  app.route('/api', terminalRoutes);

  return app;
}
