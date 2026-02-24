import { Hono } from 'hono';

import { artifactDirRoutes } from './routes/artifact-dirs.js';
import { projectRoutes } from './routes/projects.js';
import { sessionRoutes } from './routes/sessions.js';

export const app = new Hono();

app.get('/health', (c) => {
  return c.json({ status: 'ok' });
});

app.route('/api', projectRoutes);
app.route('/api', artifactDirRoutes);
app.route('/api', sessionRoutes);
