import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { useRefreshArtifactFilesOnStreamComplete } from "@/hooks/use-refresh-artifact-files-on-stream-complete";
import { queryKeys } from "@/lib/query-keys";
import { getBrowserQueryClient } from "@/lib/query-client";

describe("useRefreshArtifactFilesOnStreamComplete", () => {
  const artifactContext = {
    projectId: "health",
    artifactId: "coach",
  };

  afterEach(() => {
    getBrowserQueryClient().clear();
    vi.restoreAllMocks();
  });

  it("invalidates artifact file links when streaming completes", () => {
    const invalidateSpy = vi.spyOn(getBrowserQueryClient(), "invalidateQueries");
    const { rerender } = renderHook(
      ({ isStreaming }) =>
        useRefreshArtifactFilesOnStreamComplete(artifactContext, isStreaming),
      {
        initialProps: {
          isStreaming: true,
        },
      },
    );

    rerender({ isStreaming: false });

    expect(invalidateSpy).toHaveBeenCalledWith({
      queryKey: queryKeys.artifacts.files(artifactContext),
    });
  });

  it("does not invalidate when streaming was never active", () => {
    const invalidateSpy = vi.spyOn(getBrowserQueryClient(), "invalidateQueries");
    const { rerender } = renderHook(
      ({ isStreaming }) =>
        useRefreshArtifactFilesOnStreamComplete(artifactContext, isStreaming),
      {
        initialProps: {
          isStreaming: false,
        },
      },
    );

    rerender({ isStreaming: false });

    expect(invalidateSpy).not.toHaveBeenCalled();
  });
});
