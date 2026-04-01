import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactPreviewDrawer } from "@/components/artifact-workspace";

const mockDiffQuery = vi.fn();
const mockRollbackMutation = vi.fn();
const storeState = vi.hoisted(() => ({
  openFile: vi.fn(),
  saveFile: vi.fn(),
  setSelectedFile: vi.fn(),
  setSelectedDiffFile: vi.fn(),
  closePreview: vi.fn(),
  clearArtifactCache: vi.fn(),
  previewModeByArtifact: {
    "project-1::artifact-1": "diff" as const,
  },
  selectedFileByArtifact: {
    "project-1::artifact-1": null,
  },
  selectedDiffFileByArtifact: {
    "project-1::artifact-1": null as string | null,
  },
  filesByArtifact: {},
  fileLoadingByKey: {},
  fileErrorByKey: {},
}));

vi.mock("@/components/artifact-code-viewer", () => ({
  ArtifactCodeViewer: ({ path }: { path: string }) => <div>Code viewer {path}</div>,
  ArtifactCodeDiffViewer: ({
    path,
    beforeContent,
    afterContent,
  }: {
    path: string;
    beforeContent: string;
    afterContent: string;
  }) => (
    <div>
      Diff viewer {path} :: {beforeContent} {"->"} {afterContent}
    </div>
  ),
}));

vi.mock("@/hooks/api", () => ({
  useArtifactCheckpointDiffQuery: () => mockDiffQuery(),
  useRollbackArtifactCheckpointMutation: () => mockRollbackMutation(),
}));

vi.mock("@/stores/artifact-files-store", () => ({
  useArtifactFilesStore: (
    selector: (state: typeof storeState) => unknown,
  ) => selector(storeState),
}));

vi.mock("@/lib/client-api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/client-api")>("@/lib/client-api");
  return {
    ...actual,
    getArtifactRawFileUrl: (
      _ctx: { projectId: string; artifactId: string },
      input: { path: string },
    ) => `https://example.test/raw/${encodeURIComponent(input.path)}`,
  };
});

describe("ArtifactPreviewDrawer", () => {
  beforeEach(() => {
    storeState.openFile.mockReset();
    storeState.saveFile.mockReset();
    storeState.setSelectedFile.mockReset();
    storeState.setSelectedDiffFile.mockReset();
    storeState.closePreview.mockReset();
    storeState.clearArtifactCache.mockReset();
    storeState.previewModeByArtifact["project-1::artifact-1"] = "diff";
    storeState.selectedFileByArtifact["project-1::artifact-1"] = null;
    storeState.selectedDiffFileByArtifact["project-1::artifact-1"] = null;
    storeState.filesByArtifact = {};
    storeState.fileLoadingByKey = {};
    storeState.fileErrorByKey = {};
    mockRollbackMutation.mockReset().mockReturnValue({
      mutateAsync: vi.fn(),
      isPending: false,
    });
  });

  it("renders an empty diff state when there are no artifact changes", () => {
    mockDiffQuery.mockReset().mockReturnValue({
      data: {
        hasRepository: true,
        headCommitHash: "abc123",
        dirty: false,
        files: [],
      },
      isPending: false,
      isError: false,
      error: null,
    });

    render(
      <ArtifactPreviewDrawer
        artifactContext={{ projectId: "project-1", artifactId: "artifact-1" }}
        containerRef={{ current: document.createElement("div") }}
        drawerWidth={420}
        isOpen
        isResizing={false}
        onResizingChange={vi.fn()}
        setDrawerRatio={vi.fn()}
      />,
    );

    expect(screen.getByText("Latest diff")).toBeInTheDocument();
    expect(screen.getByText("No unsaved changes in this artifact.")).toBeInTheDocument();
  });

  it("renders Monaco diff content for changed text files", () => {
    storeState.selectedDiffFileByArtifact["project-1::artifact-1"] = "src/index.ts";
    mockDiffQuery.mockReset().mockReturnValue({
      data: {
        hasRepository: true,
        headCommitHash: "abc123",
        dirty: true,
        files: [
          {
            path: "src/index.ts",
            previousPath: null,
            changeType: "modified",
            isBinary: false,
            beforeText: "before",
            afterText: "after",
            textTruncated: false,
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
    });

    render(
      <ArtifactPreviewDrawer
        artifactContext={{ projectId: "project-1", artifactId: "artifact-1" }}
        containerRef={{ current: document.createElement("div") }}
        drawerWidth={420}
        isOpen
        isResizing={false}
        onResizingChange={vi.fn()}
        setDrawerRatio={vi.fn()}
      />,
    );

    expect(screen.getByText("Changed since latest commit")).toBeInTheDocument();
    expect(
      screen.getByText("Diff viewer src/index.ts :: before -> after"),
    ).toBeInTheDocument();
  });

  it("renders image previews for changed binary assets", () => {
    storeState.selectedDiffFileByArtifact["project-1::artifact-1"] = "assets/mock.png";
    mockDiffQuery.mockReset().mockReturnValue({
      data: {
        hasRepository: true,
        headCommitHash: "abc123",
        dirty: true,
        files: [
          {
            path: "assets/mock.png",
            previousPath: null,
            changeType: "added",
            isBinary: true,
            beforeText: null,
            afterText: null,
            textTruncated: false,
          },
        ],
      },
      isPending: false,
      isError: false,
      error: null,
    });

    render(
      <ArtifactPreviewDrawer
        artifactContext={{ projectId: "project-1", artifactId: "artifact-1" }}
        containerRef={{ current: document.createElement("div") }}
        drawerWidth={420}
        isOpen
        isResizing={false}
        onResizingChange={vi.fn()}
        setDrawerRatio={vi.fn()}
      />,
    );

    expect(screen.getByText("Added since latest commit")).toBeInTheDocument();
    expect(screen.getByAltText("mock.png")).toBeInTheDocument();
  });
});
