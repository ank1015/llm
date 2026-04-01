import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ArtifactMainPanel } from "@/components/artifact-main-panel";

const mockSessionsQuery = vi.fn();
const mockCheckpointQuery = vi.fn();

vi.mock("next/navigation", () => ({
  useParams: () => ({
    projectId: "project-1",
    artifactId: "artifact-1",
  }),
}));

vi.mock("@/hooks/api", () => ({
  useArtifactCheckpointsQuery: () => mockCheckpointQuery(),
}));

vi.mock("@/hooks/api/sessions", () => ({
  useSessionsQuery: () => mockSessionsQuery(),
}));

vi.mock("@/components/artifact-chat-composer", () => ({
  ArtifactChatComposer: () => <div data-testid="artifact-chat-composer" />,
}));

describe("ArtifactMainPanel", () => {
  beforeEach(() => {
    mockSessionsQuery.mockReset().mockReturnValue({
      data: [],
      isPending: false,
      isError: false,
    });
    mockCheckpointQuery.mockReset().mockReturnValue({
      data: {
        hasRepository: true,
        dirty: false,
        headCommitHash: "head123",
        checkpoints: [
          {
            commitHash: "pending123",
            shortHash: "pending1",
            createdAt: "2026-04-01T08:30:00.000Z",
            summaryStatus: "pending",
            title: null,
            description: null,
            isHead: true,
          },
          {
            commitHash: "failed123",
            shortHash: "failed1",
            createdAt: "2026-04-01T07:15:00.000Z",
            summaryStatus: "failed",
            title: null,
            description: null,
            isHead: false,
          },
          {
            commitHash: "manual123",
            shortHash: "manual1",
            createdAt: "2026-04-01T06:00:00.000Z",
            summaryStatus: "unavailable",
            title: null,
            description: null,
            isHead: false,
          },
        ],
      },
      isPending: false,
      isError: false,
    });
  });

  it("renders real checkpoint history with fallback titles and descriptions", () => {
    render(<ArtifactMainPanel />);

    fireEvent.click(screen.getByRole("button", { name: /artifact context/i }));

    expect(screen.getByText("Generating checkpoint summary")).toBeInTheDocument();
    expect(
      screen.getByText("Checkpoint saved. Summary is still being generated."),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Checkpoint saved")[0]).toBeInTheDocument();
    expect(
      screen.getByText("Summary generation failed for this checkpoint."),
    ).toBeInTheDocument();
    expect(screen.getByText("Checkpoint manual1")).toBeInTheDocument();
    expect(screen.getByText("Saved without an AI summary.")).toBeInTheDocument();
    expect(
      screen.getByText(new Date("2026-04-01T08:30:00.000Z").toLocaleString()),
    ).toBeInTheDocument();
  });
});
