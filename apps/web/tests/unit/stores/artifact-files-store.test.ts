import { beforeEach, describe, expect, it, vi } from "vitest";

import { getBrowserQueryClient } from "@/lib/query-client";
import { useArtifactFilesStore } from "@/stores/artifact-files-store";

const { getProjectFileIndexMock, updateArtifactFileMock } = vi.hoisted(() => ({
  getProjectFileIndexMock: vi.fn(),
  updateArtifactFileMock: vi.fn(),
}));

vi.mock("@/lib/client-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/client-api")>("@/lib/client-api");

  return {
    ...actual,
    getProjectFileIndex: getProjectFileIndexMock,
    updateArtifactFile: updateArtifactFileMock,
  };
});

describe("artifact-files store", () => {
  beforeEach(() => {
    getProjectFileIndexMock.mockReset();
    updateArtifactFileMock.mockReset();
    getBrowserQueryClient().clear();
    useArtifactFilesStore.setState({
      directoriesByArtifact: {},
      filesByArtifact: {},
      selectedFileByArtifact: {},
      previewModeByArtifact: {},
      selectedDiffFileByArtifact: {},
      directoryLoadingByKey: {},
      fileLoadingByKey: {},
      directoryErrorByKey: {},
      fileErrorByKey: {},
      projectFileIndexByProject: {},
      projectFileIndexTruncatedByProject: {},
      projectFileIndexLoadingByProject: {},
      projectFileIndexErrorByProject: {},
    });
  });

  it("searchProjectFiles always fetches fresh results from the server", async () => {
    useArtifactFilesStore.setState({
      projectFileIndexByProject: {
        "project-1": [
          {
            artifactId: "artifact-1",
            artifactName: "Artifact 1",
            path: "stale.txt",
            type: "file",
            artifactPath: "artifact-1/stale.txt",
            size: 10,
            updatedAt: "2026-03-27T00:00:00.000Z",
          },
        ],
      },
      projectFileIndexTruncatedByProject: {
        "project-1": false,
      },
    });

    const freshEntry = {
      artifactId: "artifact-1",
      artifactName: "Artifact 1",
      path: "fresh.txt",
      type: "file" as const,
      artifactPath: "artifact-1/fresh.txt",
      size: 20,
      updatedAt: "2026-03-27T01:00:00.000Z",
    };

    getProjectFileIndexMock.mockResolvedValue({
      projectId: "project-1",
      query: "fresh",
      files: [freshEntry],
      truncated: false,
    });

    const result = await useArtifactFilesStore
      .getState()
      .searchProjectFiles("project-1", "fresh", 25);

    expect(getProjectFileIndexMock).toHaveBeenCalledWith("project-1", {
      query: "fresh",
      limit: 25,
    });
    expect(result).toEqual([freshEntry]);
  });

  it("saveFile updates the cached file contents", async () => {
    const ctx = { projectId: "project-1", artifactId: "artifact-1" } as const;

    useArtifactFilesStore.setState({
      filesByArtifact: {
        "project-1::artifact-1": {
          "src/index.ts": {
            path: "src/index.ts",
            content: "console.log('old')",
            size: 18,
            updatedAt: "2026-03-31T05:00:00.000Z",
            isBinary: false,
            truncated: false,
          },
        },
      },
      selectedFileByArtifact: {
        "project-1::artifact-1": "src/index.ts",
      },
    });

    updateArtifactFileMock.mockResolvedValue({
      path: "src/index.ts",
      content: "console.log('new')",
      size: 18,
      updatedAt: "2026-03-31T06:00:00.000Z",
      isBinary: false,
      truncated: false,
    });

    const result = await useArtifactFilesStore.getState().saveFile(ctx, {
      path: "src/index.ts",
      content: "console.log('new')",
    });

    expect(updateArtifactFileMock).toHaveBeenCalledWith(ctx, {
      path: "src/index.ts",
      content: "console.log('new')",
    });
    expect(result.content).toBe("console.log('new')");
    expect(
      useArtifactFilesStore.getState().filesByArtifact["project-1::artifact-1"]?.["src/index.ts"]
        ?.content,
    ).toBe("console.log('new')");
  });

  it("tracks preview mode when opening and closing diff preview", () => {
    const ctx = { projectId: "project-1", artifactId: "artifact-1" } as const;

    useArtifactFilesStore.getState().openDiffPreview(ctx, "assets/mock.png");

    expect(useArtifactFilesStore.getState().previewModeByArtifact["project-1::artifact-1"]).toBe(
      "diff",
    );
    expect(
      useArtifactFilesStore.getState().selectedDiffFileByArtifact["project-1::artifact-1"],
    ).toBe("assets/mock.png");

    useArtifactFilesStore.getState().closePreview(ctx);

    expect(useArtifactFilesStore.getState().previewModeByArtifact["project-1::artifact-1"]).toBe(
      null,
    );
    expect(
      useArtifactFilesStore.getState().selectedDiffFileByArtifact["project-1::artifact-1"],
    ).toBe(null);
  });
});
