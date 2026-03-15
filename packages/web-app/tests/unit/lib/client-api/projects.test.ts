import { afterEach, describe, expect, it, vi } from 'vitest';

describe('projects client-api', () => {
  const originalServerBase = process.env.NEXT_PUBLIC_LLM_SERVER_BASE_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_LLM_SERVER_BASE_URL = originalServerBase;
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it('uses the configured server base URL and trims trailing slashes', async () => {
    process.env.NEXT_PUBLIC_LLM_SERVER_BASE_URL = 'https://example.test/root/';

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        headers: {
          'Content-Type': 'application/json',
        },
        status: 200,
      })
    );

    vi.stubGlobal('fetch', fetchMock);

    const projectsApi = await import('@/lib/client-api/projects');

    await projectsApi.listProjects();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://example.test/root/api/projects',
      expect.objectContaining({
        method: 'GET',
      })
    );

    expect(
      projectsApi.getArtifactRawFileUrl(
        { projectId: 'project-1', artifactId: 'artifact-1' },
        { path: 'notes/todo.md' }
      )
    ).toBe(
      'https://example.test/root/api/projects/project-1/artifacts/artifact-1/file/raw?path=notes%2Ftodo.md'
    );
  });

  it('falls back to the default local server base URL', async () => {
    delete process.env.NEXT_PUBLIC_LLM_SERVER_BASE_URL;

    const { resolveServerBaseUrl } = await import('@/lib/client-api/http');

    expect(resolveServerBaseUrl()).toBe('http://localhost:8001');
  });
});
