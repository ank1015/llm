"use client";

import { createContext, useContext, useMemo } from "react";

import { useArtifactFilesQuery } from "@/hooks/api/projects";
import { createArtifactFilePathResolver } from "@/lib/messages/chat-file-links";
import { useArtifactFilesStore } from "@/stores/artifact-files-store";

import type { ArtifactContext } from "@/lib/client-api";
import type { ArtifactFilePathResolver } from "@/lib/messages/chat-file-links";

export type ChatFileLinksController = {
  resolve: ArtifactFilePathResolver;
  open: (path: string) => Promise<void> | void;
};

const ChatFileLinksContext = createContext<ChatFileLinksController | null>(null);

export function ChatFileLinksProvider({
  value,
  children,
}: {
  value: ChatFileLinksController | null;
  children: React.ReactNode;
}) {
  return <ChatFileLinksContext.Provider value={value}>{children}</ChatFileLinksContext.Provider>;
}

export function useChatFileLinks(): ChatFileLinksController | null {
  return useContext(ChatFileLinksContext);
}

export function ArtifactChatFileLinksProvider({
  artifactContext,
  children,
}: {
  artifactContext: ArtifactContext;
  children: React.ReactNode;
}) {
  const { data: filePaths = [] } = useArtifactFilesQuery(artifactContext);
  const openFile = useArtifactFilesStore((state) => state.openFile);

  const controller = useMemo<ChatFileLinksController>(
    () => ({
      resolve: createArtifactFilePathResolver({
        artifactId: artifactContext.artifactId,
        filePaths,
      }),
      open: async (path: string) => {
        await openFile(artifactContext, path);
      },
    }),
    [artifactContext, filePaths, openFile],
  );

  return <ChatFileLinksProvider value={controller}>{children}</ChatFileLinksProvider>;
}
