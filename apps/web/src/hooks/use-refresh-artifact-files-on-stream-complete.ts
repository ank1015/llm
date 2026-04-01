"use client";

import { useEffect, useRef } from "react";

import { queryKeys } from "@/lib/query-keys";
import { getBrowserQueryClient } from "@/lib/query-client";

import type { ArtifactContext } from "@/lib/client-api";

export function useRefreshArtifactFilesOnStreamComplete(
  artifactContext: ArtifactContext,
  isStreaming: boolean,
) {
  const previousIsStreamingRef = useRef(isStreaming);

  useEffect(() => {
    const wasStreaming = previousIsStreamingRef.current;
    previousIsStreamingRef.current = isStreaming;

    if (!wasStreaming || isStreaming) {
      return;
    }

    const queryClient = getBrowserQueryClient();
    void Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.artifacts.files(artifactContext),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.artifacts.checkpointDiff(artifactContext),
      }),
    ]);
  }, [artifactContext, isStreaming]);
}
