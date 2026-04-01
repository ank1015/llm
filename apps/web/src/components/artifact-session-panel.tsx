"use client";

import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { useStickToBottom } from "use-stick-to-bottom";

import { ArtifactChatComposer } from "@/components/artifact-chat-composer";
import { ArtifactChatFileLinksProvider } from "@/components/chat-file-links-provider";
import { ChatMessages } from "@/components/chat-messages";
import { useRefreshArtifactFilesOnStreamComplete } from "@/hooks/use-refresh-artifact-files-on-stream-complete";
import { useChatStore } from "@/stores/chat-store";

const EMPTY_MESSAGES: ReturnType<typeof useChatStore.getState>["messagesBySession"][string] = [];

export function ArtifactSessionPanel() {
  const { projectId, artifactId, sessionId } = useParams<{
    projectId: string;
    artifactId: string;
    sessionId: string;
  }>();
  const activeSession = useChatStore((state) => state.activeSession);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const messages = useChatStore((state) => state.messagesBySession[sessionId] ?? EMPTY_MESSAGES);
  const streamingAssistant = useChatStore(
    (state) => state.streamingAssistantBySession[sessionId] ?? null,
  );
  const isStreaming = useChatStore((state) => state.isStreamingBySession[sessionId] ?? false);
  const isLoading = useChatStore((state) => state.isLoadingMessagesBySession[sessionId] ?? false);
  const error = useChatStore((state) => state.errorsBySession[sessionId] ?? null);
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerReserve, setComposerReserve] = useState(200);
  const artifactContext = useMemo(
    () => ({
      projectId,
      artifactId,
    }),
    [artifactId, projectId],
  );
  const { scrollRef, contentRef } = useStickToBottom({
    stiffness: 1,
    damping: 0,
  });

  useRefreshArtifactFilesOnStreamComplete(artifactContext, isStreaming);

  useEffect(() => {
    if (!sessionId) {
      return;
    }

    const nextSession = { sessionId };
    if (activeSession?.sessionId !== sessionId) {
      setActiveSession(nextSession);
    }

    void loadMessages({
      session: nextSession,
      ...artifactContext,
    });
  }, [activeSession?.sessionId, artifactContext, loadMessages, sessionId, setActiveSession]);

  useEffect(() => {
    const element = composerRef.current;
    if (!element) {
      return;
    }

    const updateHeight = () => {
      setComposerReserve(Math.ceil(element.getBoundingClientRect().height));
    };

    updateHeight();

    const observer = new ResizeObserver(() => {
      updateHeight();
    });
    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, []);

  const hasRenderableContent =
    messages.length > 0 || isStreaming || Boolean(streamingAssistant);

  return (
    <div className="relative flex h-full min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <ArtifactChatFileLinksProvider artifactContext={artifactContext}>
        <div
          ref={scrollRef}
          className="no-scrollbar flex h-full min-h-0 w-full min-w-0 flex-1 flex-col items-center overflow-y-auto overflow-x-hidden px-8"
        >
          <div
            ref={contentRef}
            className="mx-auto w-full max-w-3xl px-2 pt-2"
            style={{ paddingBottom: `${composerReserve + 80}px` }}
          >
            {hasRenderableContent ? (
              <ChatMessages sessionId={sessionId} />
            ) : isLoading ? (
              <div className="flex min-h-[50vh] items-center justify-center px-6 py-16">
                <p className="text-sm leading-7 text-black/46 dark:text-white/44">
                  Loading thread…
                </p>
              </div>
            ) : error ? (
              <div className="flex min-h-[50vh] items-center justify-center px-6 py-16">
                <p className="text-sm leading-7 text-[#FF6363]">{error}</p>
              </div>
            ) : (
              <div className="flex min-h-[50vh] items-center justify-center px-6 py-16">
                <p className="text-sm leading-7 text-black/46 dark:text-white/44">
                  Start the thread below.
                </p>
              </div>
            )}
          </div>
        </div>
      </ArtifactChatFileLinksProvider>

      <div className="bg-home-page pointer-events-none absolute inset-x-0 bottom-0 w-full px-8">
        <div
          ref={composerRef}
          className="pointer-events-auto mx-auto flex w-full max-w-3xl flex-col items-start pb-4"
        >
          <ArtifactChatComposer projectId={projectId} artifactId={artifactId} sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}
