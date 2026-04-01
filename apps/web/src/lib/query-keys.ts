import type { ArtifactContext, ProjectFileIndexInput } from "@/lib/client-api";
import type { KeyProviderContract } from "@ank1015/llm-server/contracts";

function normalizeString(value?: string): string {
  return value?.trim() ?? "";
}

function normalizeInteger(value?: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return null;
  }

  return Math.floor(value);
}

const projectScope = (projectId: string) => ["projects", projectId] as const;
const artifactScope = (ctx: ArtifactContext) =>
  [...projectScope(ctx.projectId), "artifacts", ctx.artifactId] as const;
const sessionScope = (ctx: ArtifactContext, sessionId: string) =>
  [...artifactScope(ctx), "sessions", sessionId] as const;
const terminalScope = (ctx: ArtifactContext, terminalId: string) =>
  [...artifactScope(ctx), "terminals", terminalId] as const;

export const queryKeys = {
  models: {
    list: () => ["models", "list"] as const,
  },
  projects: {
    root: ["projects"] as const,
    list: () => ["projects", "list"] as const,
    scope: projectScope,
    detail: (projectId: string) => [...projectScope(projectId), "detail"] as const,
    overview: (projectId: string) => [...projectScope(projectId), "overview"] as const,
    fileIndexRoot: (projectId: string) =>
      [...projectScope(projectId), "file-index"] as const,
    fileIndex: (projectId: string, input?: ProjectFileIndexInput) =>
      [
        ...queryKeys.projects.fileIndexRoot(projectId),
        {
          query: normalizeString(input?.query),
          limit: normalizeInteger(input?.limit),
        },
      ] as const,
  },
  artifacts: {
    list: (projectId: string) => [...projectScope(projectId), "artifacts", "list"] as const,
    scope: artifactScope,
    detail: (ctx: ArtifactContext) => [...artifactScope(ctx), "detail"] as const,
    files: (ctx: ArtifactContext) => [...artifactScope(ctx), "files"] as const,
    checkpoints: (ctx: ArtifactContext) =>
      [...artifactScope(ctx), "checkpoints"] as const,
    checkpointDiff: (ctx: ArtifactContext) =>
      [...artifactScope(ctx), "checkpoints", "diff"] as const,
    explorer: (ctx: ArtifactContext, path = "") =>
      [...artifactScope(ctx), "explorer", normalizeString(path)] as const,
    file: (ctx: ArtifactContext, input: { path: string; maxBytes?: number }) =>
      [
        ...artifactScope(ctx),
        "file",
        {
          path: input.path,
          maxBytes: normalizeInteger(input.maxBytes),
        },
      ] as const,
  },
  sessions: {
    list: (ctx: ArtifactContext) => [...artifactScope(ctx), "sessions", "list"] as const,
    scope: sessionScope,
    detail: (ctx: ArtifactContext, sessionId: string) =>
      [...sessionScope(ctx, sessionId), "detail"] as const,
    messages: (ctx: ArtifactContext, sessionId: string) =>
      [...sessionScope(ctx, sessionId), "messages"] as const,
    tree: (ctx: ArtifactContext, sessionId: string) =>
      [...sessionScope(ctx, sessionId), "tree"] as const,
  },
  keys: {
    list: () => ["keys", "list"] as const,
    detail: (provider: KeyProviderContract) =>
      ["keys", "detail", provider] as const,
  },
  terminals: {
    list: (ctx: ArtifactContext) => [...artifactScope(ctx), "terminals", "list"] as const,
    scope: terminalScope,
    detail: (ctx: ArtifactContext, terminalId: string) =>
      [...terminalScope(ctx, terminalId), "detail"] as const,
  },
} as const;
