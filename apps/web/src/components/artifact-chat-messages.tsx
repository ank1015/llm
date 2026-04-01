"use client";

import { useMemo } from "react";

import type {
  AgentEvent,
  Api,
  BaseAssistantMessage,
  UserMessage,
} from "@ank1015/llm-sdk";

import { getArtifactRawFileUrl } from "@/lib/client-api";
import {
  getTextFromBaseAssistantMessage,
  getTextFromUserMessage,
} from "@/lib/messages/utils";
import { useChatStore } from "@/stores/chat-store";

import type { PendingPrompt } from "@/stores/chat-store";
import type { MessageNode } from "@/stores/types";

type AssistantStreamingMessage = Omit<BaseAssistantMessage<Api>, "message">;
type MessageTurn = {
  userNode: MessageNode | null;
  assistantNode: MessageNode | null;
};

const EMPTY_MESSAGES: MessageNode[] = [];
const EMPTY_PENDING_PROMPTS: PendingPrompt[] = [];
const EMPTY_STREAMING_ASSISTANT: AssistantStreamingMessage | null = null;
const EMPTY_AGENT_EVENTS: AgentEvent[] = [];

function getAttachmentMetadataValue(
  metadata: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const value = metadata?.[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function formatAttachmentSize(size: unknown): string | null {
  if (typeof size !== "number" || !Number.isFinite(size) || size <= 0) {
    return null;
  }

  if (size < 1024) {
    return `${size} B`;
  }

  if (size < 1024 * 1024) {
    return `${(size / 1024).toFixed(1)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

function groupIntoTurns(nodes: MessageNode[]): MessageTurn[] {
  const turns: MessageTurn[] = [];
  let currentUser: MessageNode | null = null;
  let currentAssistant: MessageNode | null = null;

  for (const node of nodes) {
    if (node.message.role === "user") {
      if (currentUser || currentAssistant) {
        turns.push({
          userNode: currentUser,
          assistantNode: currentAssistant,
        });
      }

      currentUser = node;
      currentAssistant = null;
      continue;
    }

    if (node.message.role === "assistant") {
      currentAssistant = node;
    }
  }

  if (currentUser || currentAssistant) {
    turns.push({
      userNode: currentUser,
      assistantNode: currentAssistant,
    });
  }

  return turns;
}

function UserMessageAttachments({
  artifactContext,
  userMessage,
}: {
  artifactContext: {
    projectId: string;
    artifactId: string;
  };
  userMessage: UserMessage;
}) {
  const attachmentBlocks = userMessage.content.filter(
    (block): block is Extract<UserMessage["content"][number], { type: "image" | "file" }> =>
      block.type === "image" || block.type === "file",
  );

  if (attachmentBlocks.length === 0) {
    return null;
  }

  return (
    <div className="flex w-full max-w-[72%] flex-col items-end gap-2">
      {attachmentBlocks.map((block, index) => {
        const fileName =
          getAttachmentMetadataValue(block.metadata, "originalFileName") ??
          getAttachmentMetadataValue(block.metadata, "fileName") ??
          (block.type === "file" ? block.filename : `image-${index + 1}`);
        const artifactRelativePath = getAttachmentMetadataValue(
          block.metadata,
          "artifactRelativePath",
        );
        const attachmentHref = artifactRelativePath
          ? getArtifactRawFileUrl(artifactContext, {
              path: artifactRelativePath,
            })
          : `data:${block.mimeType};base64,${block.data}`;
        const sizeLabel = formatAttachmentSize(block.metadata?.size);

        if (block.type === "image") {
          return (
            <a
              key={`${userMessage.id}-attachment-${index}`}
              href={attachmentHref}
              target="_blank"
              rel="noreferrer"
              className="overflow-hidden rounded-2xl border border-black/8 bg-accent dark:border-white/10"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`data:${block.mimeType};base64,${block.data}`}
                alt={fileName}
                className="max-h-72 w-auto max-w-full object-cover"
              />
            </a>
          );
        }

        return (
          <a
            key={`${userMessage.id}-attachment-${index}`}
            href={attachmentHref}
            target="_blank"
            rel="noreferrer"
            className="flex w-full items-center gap-3 rounded-2xl border border-black/8 bg-accent px-4 py-3 text-black transition-colors hover:bg-black/[0.04] dark:border-white/10 dark:text-white dark:hover:bg-white/[0.04]"
          >
            <div className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#FF6363]/12 text-[0.56rem] font-semibold uppercase tracking-[0.14em] text-[#FF6363]">
              PDF
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{fileName}</div>
              <div className="text-xs text-black/45 dark:text-white/42">
                {sizeLabel ?? "Document"}
              </div>
            </div>
          </a>
        );
      })}
    </div>
  );
}

function UserMessageBubble({
  artifactContext,
  node,
}: {
  artifactContext: {
    projectId: string;
    artifactId: string;
  };
  node: MessageNode;
}) {
  const userMessage = node.message as UserMessage;
  const text = getTextFromUserMessage(userMessage);

  return (
    <div className="flex w-full flex-col items-end gap-2">
      <UserMessageAttachments artifactContext={artifactContext} userMessage={userMessage} />
      {text.length > 0 ? (
        <div className="max-w-[72%] whitespace-pre-wrap rounded-2xl bg-accent px-4 py-3 text-[0.95rem] leading-7 text-black dark:text-white">
          {text}
        </div>
      ) : null}
    </div>
  );
}

function AssistantMessageBubble({
  text,
  isStreaming,
}: {
  text: string;
  isStreaming?: boolean;
}) {
  if (text.trim().length === 0 && !isStreaming) {
    return null;
  }

  return (
    <div className="flex w-full justify-start">
      <div className="max-w-[96%] whitespace-pre-wrap px-1 text-[0.98rem] leading-8 text-black/88 dark:text-white/88">
        {text.trim().length > 0 ? text : "Working…"}
      </div>
    </div>
  );
}

function PendingPromptBubble({
  pending,
}: {
  pending: PendingPrompt;
}) {
  return (
    <div className="flex w-full justify-end">
      <div
        className={[
          "max-w-[72%] rounded-2xl px-4 py-3 text-[0.92rem] leading-7",
          pending.status === "failed"
            ? "bg-[#FF6363]/10 text-[#FF6363]"
            : "bg-accent text-black/78 dark:text-white/78",
        ].join(" ")}
      >
        <div>{pending.prompt || "Attachment"}</div>
        <div
          className={[
            "mt-1 text-[0.72rem] leading-5",
            pending.status === "failed"
              ? "text-[#FF6363]"
              : "text-black/42 dark:text-white/42",
          ].join(" ")}
        >
          {pending.status === "failed" ? pending.error ?? "Failed to send." : "Sending…"}
        </div>
      </div>
    </div>
  );
}

export function ArtifactChatMessages({
  projectId,
  artifactId,
  sessionId,
}: {
  projectId: string;
  artifactId: string;
  sessionId: string;
}) {
  const messages = useChatStore((state) => state.messagesBySession[sessionId] ?? EMPTY_MESSAGES);
  const pendingPrompts = useChatStore(
    (state) => state.pendingPromptsBySession[sessionId] ?? EMPTY_PENDING_PROMPTS,
  );
  const streamingAssistant = useChatStore(
    (state) => state.streamingAssistantBySession[sessionId] ?? EMPTY_STREAMING_ASSISTANT,
  );
  const isStreaming = useChatStore((state) => state.isStreamingBySession[sessionId] ?? false);
  const agentEvents = useChatStore((state) => state.agentEventsBySession[sessionId] ?? EMPTY_AGENT_EVENTS);
  const turns = useMemo(() => groupIntoTurns(messages), [messages]);
  const streamingText = streamingAssistant
    ? getTextFromBaseAssistantMessage(streamingAssistant)
    : "";
  const artifactContext = {
    projectId,
    artifactId,
  };

  if (
    turns.length === 0 &&
    pendingPrompts.length === 0 &&
    streamingText.trim().length === 0 &&
    !isStreaming
  ) {
    return null;
  }

  return (
    <div className="mt-8 flex w-full flex-col gap-5">
      {turns.map((turn, index) => (
        <div key={turn.userNode?.id ?? turn.assistantNode?.id ?? `turn-${index}`} className="flex w-full flex-col gap-3">
          {turn.userNode ? (
            <UserMessageBubble artifactContext={artifactContext} node={turn.userNode} />
          ) : null}
          {turn.assistantNode ? (
            <AssistantMessageBubble
              text={getTextFromBaseAssistantMessage(turn.assistantNode.message as BaseAssistantMessage<Api>)}
            />
          ) : null}
        </div>
      ))}

      {pendingPrompts.map((pending) => (
        <PendingPromptBubble key={pending.id} pending={pending} />
      ))}

      {isStreaming ? (
        <div className="flex flex-col gap-2">
          {agentEvents.length > 0 ? (
            <div className="px-1 text-[0.72rem] uppercase tracking-[0.18em] text-black/34 dark:text-white/32">
              Streaming {agentEvents.length} event{agentEvents.length === 1 ? "" : "s"}
            </div>
          ) : null}
          <AssistantMessageBubble text={streamingText} isStreaming />
        </div>
      ) : null}
    </div>
  );
}
