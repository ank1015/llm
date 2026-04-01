"use client";

import { FileDiffIcon, GitCommitHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useState } from "react";
import { toast } from "sonner";

import { ArtifactDialogFrame } from "@/components/artifact-dialog-frame";
import {
  useArtifactCheckpointDiffQuery,
  useCreateArtifactCheckpointMutation,
} from "@/hooks/api";
import { useArtifactFilesStore } from "@/stores/artifact-files-store";

import type { ArtifactContext } from "@/lib/client-api";

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unexpected error";
}

function getActionButtonClassName({
  disabled = false,
}: {
  disabled?: boolean;
} = {}) {
  return [
    "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 text-[12px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:focus-visible:ring-white/12",
    disabled
      ? "cursor-not-allowed border-black/8 bg-black/[0.03] text-black/30 dark:border-white/10 dark:bg-white/[0.03] dark:text-white/26"
      : "border-black/8 bg-white text-black/78 hover:bg-accent hover:text-black dark:border-white/10 dark:bg-[#151515] dark:text-white/82 dark:hover:bg-accent dark:hover:text-white",
  ].join(" ");
}

export function ArtifactCheckpointControls({
  artifactContext,
  compact = false,
}: {
  artifactContext: ArtifactContext;
  compact?: boolean;
}) {
  const [isCommitDialogOpen, setIsCommitDialogOpen] = useState(false);
  const openDiffPreview = useArtifactFilesStore((state) => state.openDiffPreview);
  const checkpointDiffQuery = useArtifactCheckpointDiffQuery(artifactContext);
  const createCheckpoint = useCreateArtifactCheckpointMutation(artifactContext);
  const hasDiff = Boolean(checkpointDiffQuery.data?.dirty);
  const isCommitDisabled =
    createCheckpoint.isPending || checkpointDiffQuery.isPending || !hasDiff;

  async function handleCommitConfirm() {
    try {
      await createCheckpoint.mutateAsync();
      setIsCommitDialogOpen(false);
      toast.success("Checkpoint saved.");
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => setIsCommitDialogOpen(true)}
          disabled={isCommitDisabled}
          className={getActionButtonClassName({
            disabled: isCommitDisabled,
          })}
          aria-label="Commit artifact changes"
          title={hasDiff ? "Commit artifact changes" : "No artifact changes to commit"}
        >
          <HugeiconsIcon
            icon={GitCommitHorizontalIcon}
            size={15}
            color="currentColor"
            strokeWidth={1.8}
          />
          {!compact ? <span>{createCheckpoint.isPending ? "Saving..." : "Commit"}</span> : null}
        </button>

        <button
          type="button"
          onClick={() => openDiffPreview(artifactContext)}
          className={getActionButtonClassName()}
          aria-label="Open diff preview"
          title="Open diff preview"
        >
          <HugeiconsIcon icon={FileDiffIcon} size={15} color="currentColor" strokeWidth={1.8} />
          {!compact ? <span>Diff</span> : null}
        </button>
      </div>

      {isCommitDialogOpen ? (
        <ArtifactDialogFrame
          title="Save changes"
          description="This will add the current artifact changes to project context."
          onClose={() => {
            if (createCheckpoint.isPending) {
              return;
            }

            setIsCommitDialogOpen(false);
          }}
          footer={
            <>
              <button
                type="button"
                onClick={() => setIsCommitDialogOpen(false)}
                disabled={createCheckpoint.isPending}
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-black/58 transition-colors hover:bg-accent hover:text-black disabled:cursor-not-allowed disabled:opacity-50 dark:text-white/58 dark:hover:bg-accent dark:hover:text-white"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  void handleCommitConfirm();
                }}
                disabled={createCheckpoint.isPending || !hasDiff}
                className="inline-flex h-10 items-center justify-center rounded-xl bg-[#FF6363] px-4 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {createCheckpoint.isPending ? "Saving..." : "Confirm"}
              </button>
            </>
          }
        />
      ) : null}
    </>
  );
}
