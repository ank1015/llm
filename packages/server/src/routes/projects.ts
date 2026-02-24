import { Hono } from 'hono';

import { Project } from '../core/index.js';

export const projectRoutes = new Hono();

/** POST /api/projects — Create a new project */
projectRoutes.post('/projects', async (c) => {
  const body = await c.req.json<{ name: string; description?: string }>();

  if (!body.name) {
    return c.json({ error: 'name is required' }, 400);
  }

  try {
    const project = await Project.create(body);
    const metadata = await project.getMetadata();
    return c.json(metadata, 201);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Failed to create project';
    return c.json({ error: message }, 409);
  }
});

/** GET /api/projects — List all projects */
projectRoutes.get('/projects', async (c) => {
  const projects = await Project.list();
  return c.json(projects);
});

/** GET /api/projects/:projectId — Get a single project */
projectRoutes.get('/projects/:projectId', async (c) => {
  const { projectId } = c.req.param();

  try {
    const project = await Project.getById(projectId);
    const metadata = await project.getMetadata();
    return c.json(metadata);
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Project not found';
    return c.json({ error: message }, 404);
  }
});

/** DELETE /api/projects/:projectId — Delete a project */
projectRoutes.delete('/projects/:projectId', async (c) => {
  const { projectId } = c.req.param();

  try {
    const project = await Project.getById(projectId);
    await project.delete();
    return c.json({ deleted: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Project not found';
    return c.json({ error: message }, 404);
  }
});
