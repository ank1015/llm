import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactCheckpointControls } from "@/components/artifact-checkpoint-controls";

const {
  openDiffPreviewMock,
  createCheckpointMutateAsyncMock,
  createCheckpointState,
  checkpointDiffState,
} = vi.hoisted(() => ({
  openDiffPreviewMock: vi.fn(),
  createCheckpointMutateAsyncMock: vi.fn(),
  createCheckpointState: {
    isPending: false,
  },
  checkpointDiffState: {
    isPending: false,
    data: {
      dirty: true,
    },
  },
}));

vi.mock("sonner", () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
}));

vi.mock("@/stores/artifact-files-store", () => ({
  useArtifactFilesStore: (selector: (state: { openDiffPreview: typeof openDiffPreviewMock }) => unknown) =>
    selector({
      openDiffPreview: openDiffPreviewMock,
    }),
}));

vi.mock("@/hooks/api", () => ({
  useArtifactCheckpointDiffQuery: () => checkpointDiffState,
  useCreateArtifactCheckpointMutation: () => ({
    mutateAsync: createCheckpointMutateAsyncMock,
    isPending: createCheckpointState.isPending,
  }),
}));

describe("ArtifactCheckpointControls", () => {
  beforeEach(() => {
    openDiffPreviewMock.mockReset();
    createCheckpointMutateAsyncMock.mockReset().mockResolvedValue({
      commitHash: "abc123",
    });
    createCheckpointState.isPending = false;
    checkpointDiffState.isPending = false;
    checkpointDiffState.data = {
      dirty: true,
    };
  });

  it("opens the commit dialog and confirms checkpoint creation", async () => {
    render(
      <ArtifactCheckpointControls
        artifactContext={{ projectId: "project-1", artifactId: "artifact-1" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /commit artifact changes/i }));

    expect(screen.getByText("Save changes")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));

    await waitFor(() => {
      expect(createCheckpointMutateAsyncMock).toHaveBeenCalledTimes(1);
    });
  });

  it("opens diff preview from the header button", () => {
    render(
      <ArtifactCheckpointControls
        artifactContext={{ projectId: "project-1", artifactId: "artifact-1" }}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /open diff preview/i }));

    expect(openDiffPreviewMock).toHaveBeenCalledWith({
      projectId: "project-1",
      artifactId: "artifact-1",
    });
  });

  it("disables commit when there are no artifact changes", () => {
    checkpointDiffState.data = {
      dirty: false,
    };

    render(
      <ArtifactCheckpointControls
        artifactContext={{ projectId: "project-1", artifactId: "artifact-1" }}
      />,
    );

    expect(screen.getByRole("button", { name: /commit artifact changes/i })).toBeDisabled();
  });

  it("hides button text in compact mode", () => {
    render(
      <ArtifactCheckpointControls
        artifactContext={{ projectId: "project-1", artifactId: "artifact-1" }}
        compact
      />,
    );

    expect(screen.queryByText("Commit")).not.toBeInTheDocument();
    expect(screen.queryByText("Diff")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /commit artifact changes/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /open diff preview/i })).toBeInTheDocument();
  });
});
