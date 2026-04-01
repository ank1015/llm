import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  useCreateArtifactCheckpointMutation,
  useCreateProjectMutation,
  useCreateSessionMutation,
  useRollbackArtifactCheckpointMutation,
  useSetKeyMutation,
  useToggleProjectArchiveMutation,
} from "@/hooks/api";
import { queryKeys } from "@/lib/query-keys";

function createWrapper(queryClient: QueryClient) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: queryClient }, children);
  };
}

describe("api hook mutations", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("invalidates the projects list after creating a project", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "project-1",
          name: "New Project",
          description: null,
          projectImg: null,
          archived: false,
          createdAt: "2026-03-30T00:00:00.000Z",
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 201,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);
    const { result } = renderHook(() => useCreateProjectMutation(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ name: "New Project" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.projects.list(),
    });
  });

  it("invalidates session and overview queries after creating a session", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "session-1",
          name: "New chat",
          modelId: "gpt-5.4",
          createdAt: "2026-03-30T00:00:00.000Z",
          activeBranch: "branch-1",
        }),
        {
          headers: {
            "Content-Type": "application/json",
          },
          status: 201,
        },
      ),
    );

    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);
    const ctx = { projectId: "project-1", artifactId: "artifact-1" };
    const { result } = renderHook(() => useCreateSessionMutation(ctx), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ modelId: "gpt-5.4" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.sessions.list(ctx),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.projects.overview(ctx.projectId),
    });
  });

  it("invalidates key list and provider details after setting credentials", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);
    const { result } = renderHook(() => useSetKeyMutation("codex"), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ apiKey: "secret" });
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.keys.list(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.keys.detail("codex"),
    });
  });

  it("invalidates project queries after toggling archive state", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "project-1",
          name: "Archived Project",
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

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);
    const { result } = renderHook(() => useToggleProjectArchiveMutation("project-1"), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.projects.list(),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.projects.detail("project-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.projects.overview("project-1"),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.projects.fileIndexRoot("project-1"),
    });
  });

  it("invalidates checkpoint history and diff after creating a checkpoint", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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
    );

    vi.stubGlobal("fetch", fetchMock);

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);
    const ctx = { projectId: "project-1", artifactId: "artifact-1" };
    const { result } = renderHook(() => useCreateArtifactCheckpointMutation(ctx), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.artifacts.checkpoints(ctx),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.artifacts.checkpointDiff(ctx),
    });
  });

  it("invalidates artifact and project file state after rollback", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
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

    const queryClient = new QueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");
    const wrapper = createWrapper(queryClient);
    const ctx = { projectId: "project-1", artifactId: "artifact-1" };
    const { result } = renderHook(() => useRollbackArtifactCheckpointMutation(ctx), {
      wrapper,
    });

    await act(async () => {
      await result.current.mutateAsync();
    });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.artifacts.checkpoints(ctx),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.artifacts.checkpointDiff(ctx),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.artifacts.files(ctx),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.artifacts.scope(ctx),
    });
    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.projects.fileIndexRoot(ctx.projectId),
    });
  });
});
