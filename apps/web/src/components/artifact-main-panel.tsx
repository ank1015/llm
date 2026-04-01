"use client";

import Link from "next/link";
import { GitCommitHorizontalIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { ArtifactChatComposer } from "@/components/artifact-chat-composer";
import { useArtifactCheckpointsQuery } from "@/hooks/api";
import { useSessionsQuery } from "@/hooks/api/sessions";

type ArtifactRootTab = "threads" | "context";

const COMPACT_CONTEXT_TIMESTAMP_WIDTH = 560;

function getTabClassName(isActive: boolean) {
  return isActive
    ? "text-sm font-medium tracking-[-0.02em] text-[#FF6363]"
    : "text-sm font-medium tracking-[-0.02em] text-black/45 transition-colors hover:text-black/70 dark:text-white/42 dark:hover:text-white/68";
}

function formatSessionDate(date: string): string {
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) {
    return date;
  }

  return new Date(parsed).toLocaleDateString();
}

function formatCheckpointDate(date: string): string {
  const parsed = Date.parse(date);
  if (Number.isNaN(parsed)) {
    return date;
  }

  return new Date(parsed).toLocaleString();
}

function getCheckpointTitle(checkpoint: {
  summaryStatus: string;
  title: string | null;
  shortHash: string;
}): string {
  switch (checkpoint.summaryStatus) {
    case "pending":
      return "Generating checkpoint summary";
    case "failed":
      return "Checkpoint saved";
    case "unavailable":
      return checkpoint.title?.trim() || `Checkpoint ${checkpoint.shortHash}`;
    default:
      return checkpoint.title?.trim() || `Checkpoint ${checkpoint.shortHash}`;
  }
}

function getCheckpointDescription(checkpoint: {
  summaryStatus: string;
  description: string | null;
}): string {
  switch (checkpoint.summaryStatus) {
    case "pending":
      return "Checkpoint saved. Summary is still being generated.";
    case "failed":
      return "Summary generation failed for this checkpoint.";
    case "unavailable":
      return checkpoint.description?.trim() || "Saved without an AI summary.";
    default:
      return checkpoint.description?.trim() || "Saved without an AI summary.";
  }
}

export function ArtifactMainPanel() {
  const { projectId, artifactId } = useParams<{
    projectId: string;
    artifactId: string;
  }>();
  const [activeTab, setActiveTab] = useState<ArtifactRootTab>("threads");
  const [expandedContextEntryId, setExpandedContextEntryId] = useState<string | null>(null);
  const [hideContextTimestamps, setHideContextTimestamps] = useState(false);
  const contentColumnRef = useRef<HTMLDivElement>(null);
  const { data: sessions = [], isPending, isError } = useSessionsQuery({
    projectId,
    artifactId,
  });
  const {
    data: checkpointHistory,
    isPending: isCheckpointPending,
    isError: isCheckpointError,
  } = useArtifactCheckpointsQuery({
    projectId,
    artifactId,
  });
  const orderedSessions = [...sessions].sort((a, b) => {
    const aTime = Date.parse(a.updatedAt ?? a.createdAt);
    const bTime = Date.parse(b.updatedAt ?? b.createdAt);
    return bTime - aTime;
  });

  useEffect(() => {
    const container = contentColumnRef.current;
    if (!container || typeof ResizeObserver === "undefined") {
      return;
    }

    const observer = new ResizeObserver(([entry]) => {
      if (!entry) {
        return;
      }

      setHideContextTimestamps(entry.contentRect.width < COMPACT_CONTEXT_TIMESTAMP_WIDTH);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col overflow-hidden">
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-8 pt-6 sm:px-8 lg:px-10">
        <div
          ref={contentColumnRef}
          className="mx-auto flex min-h-full w-full max-w-3xl flex-col"
        >
          <div className="flex items-center gap-5 pb-5">
            <button
              type="button"
              onClick={() => setActiveTab("threads")}
              className={getTabClassName(activeTab === "threads")}
            >
              Threads
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("context")}
              className={getTabClassName(activeTab === "context")}
            >
              Artifact Context
            </button>
          </div>

          <div className="h-px w-full bg-black/6 dark:bg-white/8" />

          {activeTab === "threads" ? (
            <div className="flex flex-1 flex-col py-8">
              {isPending ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={`thread-skeleton-${index}`}
                      className="h-11 animate-pulse rounded-xl bg-accent"
                    />
                  ))}
                </div>
              ) : isError ? (
                <div className="flex flex-1 items-center justify-center px-6 py-16">
                  <p className="text-sm leading-7 text-[#FF6363]">Could not load threads.</p>
                </div>
              ) : orderedSessions.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-6 py-16">
                  <p className="text-sm leading-7 text-black/46 dark:text-white/44">
                    No threads yet.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-1">
                  {orderedSessions.map((session) => (
                    <Link
                      key={session.sessionId}
                      href={`/${projectId}/${artifactId}/${session.sessionId}`}
                      className="flex items-center justify-between gap-4 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-accent"
                    >
                      <span className="min-w-0 truncate text-sm font-medium text-black dark:text-white">
                        {session.sessionName}
                      </span>
                      <span className="shrink-0 text-xs text-black/42 dark:text-white/40">
                        {formatSessionDate(session.createdAt)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="flex flex-1 flex-col py-8 pr-4 sm:pr-[1.35rem]">
              {isCheckpointPending && !checkpointHistory ? (
                <div className="flex flex-col gap-2">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div
                      key={`checkpoint-skeleton-${index}`}
                      className="h-16 animate-pulse rounded-2xl bg-accent"
                    />
                  ))}
                </div>
              ) : isCheckpointError ? (
                <div className="flex flex-1 items-center justify-center px-6 py-16">
                  <p className="text-sm leading-7 text-[#FF6363]">
                    Could not load artifact history.
                  </p>
                </div>
              ) : !checkpointHistory || checkpointHistory.checkpoints.length === 0 ? (
                <div className="flex flex-1 items-center justify-center px-6 py-16">
                  <p className="text-sm leading-7 text-black/46 dark:text-white/44">
                    No checkpoints yet.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {checkpointHistory.checkpoints.map((checkpoint, index) => {
                    const isOpen = expandedContextEntryId === checkpoint.commitHash;
                    const description = getCheckpointDescription(checkpoint);
                    const title = getCheckpointTitle(checkpoint);
                    const isExpandable = description.length > 0;

                    return (
                      <div
                        key={checkpoint.commitHash}
                        className={[
                          "grid gap-x-3 py-4",
                          hideContextTimestamps
                            ? "grid-cols-[2.25rem_minmax(0,1fr)] sm:grid-cols-[2.6rem_minmax(0,1fr)]"
                            : "grid-cols-[2.25rem_minmax(0,1fr)_auto] sm:grid-cols-[2.6rem_minmax(0,1fr)_auto]",
                        ].join(" ")}
                      >
                        <div className="relative row-span-2 flex justify-center">
                          {index < checkpointHistory.checkpoints.length - 1 ? (
                            <div className="absolute left-1/2 top-7 h-[calc(100%+1.15rem)] w-px -translate-x-1/2 bg-black/8 dark:bg-white/10" />
                          ) : null}
                          <span className="relative z-10 inline-flex h-5 w-5 items-center justify-center text-black/44 dark:text-white/42">
                            <HugeiconsIcon
                              icon={GitCommitHorizontalIcon}
                              size={18}
                              color="currentColor"
                              strokeWidth={1.8}
                            />
                          </span>
                        </div>

                        <button
                          type="button"
                          disabled={!isExpandable}
                          aria-expanded={isExpandable ? isOpen : undefined}
                          onClick={() => {
                            if (!isExpandable) {
                              return;
                            }

                            setExpandedContextEntryId((currentId) =>
                              currentId === checkpoint.commitHash ? null : checkpoint.commitHash,
                            );
                          }}
                          className={[
                            "w-full items-start gap-x-3 text-left focus-visible:outline-none focus-visible:ring-0",
                            hideContextTimestamps
                              ? "col-span-1 grid grid-cols-[minmax(0,1fr)]"
                              : "col-span-2 grid grid-cols-[minmax(0,1fr)_auto]",
                            isExpandable ? "cursor-pointer" : "cursor-default",
                          ].join(" ")}
                          title={hideContextTimestamps ? formatCheckpointDate(checkpoint.createdAt) : undefined}
                        >
                          <p className="min-w-0 text-[0.94rem] leading-7 text-black/84 dark:text-white/84">
                            {title}
                          </p>
                          {hideContextTimestamps ? null : (
                            <div className="pt-0.5 text-right text-[0.78rem] leading-6 text-black/40 dark:text-white/38">
                              {formatCheckpointDate(checkpoint.createdAt)}
                            </div>
                          )}
                        </button>

                        <div
                          className={[
                            "col-start-2 mt-0.5 grid min-w-0 transition-[grid-template-rows,opacity] duration-300 ease-out",
                            isOpen && isExpandable
                              ? "grid-rows-[1fr] opacity-100"
                              : "grid-rows-[0fr] opacity-0",
                          ].join(" ")}
                        >
                          <div className="overflow-hidden">
                            <p className="pb-1 text-[0.82rem] leading-6 text-black/46 dark:text-white/44">
                              {description}
                            </p>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="shrink-0 px-5 pb-5 pt-3 sm:px-8 lg:px-10">
        <div className="mx-auto w-full max-w-3xl">
          <ArtifactChatComposer projectId={projectId} artifactId={artifactId} />
        </div>
      </div>
    </div>
  );
}
