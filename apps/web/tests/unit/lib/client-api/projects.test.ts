import { afterEach, describe, expect, it, vi } from "vitest";

describe("projects client-api", () => {
  const originalServerBase = process.env.NEXT_PUBLIC_LLM_SERVER_BASE_URL;

  afterEach(() => {
    if (originalServerBase === undefined) {
      delete process.env.NEXT_PUBLIC_LLM_SERVER_BASE_URL;
    } else {
      process.env.NEXT_PUBLIC_LLM_SERVER_BASE_URL = originalServerBase;
    }
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("uses the configured server base URL and trims trailing slashes", async () => {
    process.env.NEXT_PUBLIC_LLM_SERVER_BASE_URL = "https://example.test/root/";

    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([]), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const projectsApi = await import("@/lib/client-api/projects");

    await projectsApi.listProjects();

    expect(fetchMock).toHaveBeenCalledWith(
      "https://example.test/root/api/projects",
      expect.objectContaining({
        method: "GET",
      }),
    );

    expect(
      projectsApi.getArtifactRawFileUrl(
        { projectId: "project-1", artifactId: "artifact-1" },
        { path: "notes/todo.md" },
      ),
    ).toBe(
      "https://example.test/root/api/projects/project-1/artifacts/artifact-1/file/raw?path=notes%2Ftodo.md",
    );
  });

  it("falls back to the default local server base URL", async () => {
    delete process.env.NEXT_PUBLIC_LLM_SERVER_BASE_URL;

    const { resolveServerBaseUrl } = await import("@/lib/client-api/http");

    expect(resolveServerBaseUrl()).toBe("http://localhost:8001");
  });

  it("calls the current project image endpoint with the expected body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "project-1",
          name: "Project One",
          description: null,
          projectImg: "https://example.test/project.png",
          archived: false,
          createdAt: "2026-03-30T00:00:00.000Z",
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { updateProjectImage } = await import("@/lib/client-api/projects");

    await updateProjectImage({
      projectId: "project-1",
      projectImg: "https://example.test/project.png",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8001/api/projects/project-img",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          projectId: "project-1",
          projectImg: "https://example.test/project.png",
        }),
      }),
    );
  });

  it("calls the archive toggle endpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "project-1",
          name: "Project One",
          description: null,
          projectImg: null,
          archived: true,
          createdAt: "2026-03-30T00:00:00.000Z",
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { toggleProjectArchive } = await import("@/lib/client-api/projects");

    await toggleProjectArchive("project-1");

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8001/api/projects/project-1/archive-toggle",
      expect.objectContaining({
        method: "PATCH",
      }),
    );
  });

  it("calls the artifact file update endpoint with the expected body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          path: "src/index.ts",
          content: "console.log('saved')",
          size: 20,
          updatedAt: "2026-03-31T06:00:00.000Z",
          isBinary: false,
          truncated: false,
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 200,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { updateArtifactFile } = await import("@/lib/client-api/projects");

    await updateArtifactFile(
      { projectId: "project-1", artifactId: "artifact-1" },
      { path: "src/index.ts", content: "console.log('saved')" },
    );

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8001/api/projects/project-1/artifacts/artifact-1/file",
      expect.objectContaining({
        method: "PATCH",
        body: JSON.stringify({
          path: "src/index.ts",
          content: "console.log('saved')",
        }),
      }),
    );
  });

  it("calls the artifact checkpoint endpoints with the expected methods", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            hasRepository: true,
            dirty: false,
            headCommitHash: "abc123",
            checkpoints: [],
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            commitHash: "abc123",
            shortHash: "abc123",
            createdAt: "2026-04-01T00:00:00.000Z",
            summaryStatus: "pending",
            title: null,
            description: null,
            isHead: true,
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 201,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            hasRepository: true,
            headCommitHash: "abc123",
            dirty: true,
            files: [],
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          },
        ),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            ok: true,
            reverted: true,
            headCommitHash: "abc123",
          }),
          {
            headers: {
              "Content-Type": "application/json",
            },
            status: 200,
          },
        ),
      );

    vi.stubGlobal("fetch", fetchMock);

    const {
      createArtifactCheckpoint,
      getArtifactCheckpointDiff,
      getArtifactCheckpoints,
      rollbackArtifactCheckpoint,
    } = await import("@/lib/client-api/projects");
    const ctx = { projectId: "project-1", artifactId: "artifact-1" } as const;

    await getArtifactCheckpoints(ctx);
    await createArtifactCheckpoint(ctx);
    await getArtifactCheckpointDiff(ctx);
    await rollbackArtifactCheckpoint(ctx);

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "http://localhost:8001/api/projects/project-1/artifacts/artifact-1/checkpoints",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "http://localhost:8001/api/projects/project-1/artifacts/artifact-1/checkpoints",
      expect.objectContaining({
        method: "POST",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "http://localhost:8001/api/projects/project-1/artifacts/artifact-1/checkpoints/diff",
      expect.objectContaining({
        method: "GET",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      4,
      "http://localhost:8001/api/projects/project-1/artifacts/artifact-1/checkpoints/rollback",
      expect.objectContaining({
        method: "POST",
      }),
    );
  });
});
