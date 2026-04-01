"use client";

import {
  ArrowUp02Icon,
  File01Icon,
  Folder01Icon,
  Pdf02Icon,
  PlusSignIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { Attachment } from "@ank1015/llm-sdk";

import { PromptModelPicker } from "@/components/prompt-model-picker";
import {
  PromptInput,
  PromptInputActions,
  PromptInputTextarea,
} from "@/components/prompt-input";
import { PromptReasoningPicker } from "@/components/prompt-reasoning-picker";
import { generateSessionName } from "@/lib/client-api";
import { cn } from "@/lib/utils";
import {
  buildFileLabel,
  extractActiveMention,
  getIndexedEntryDisplayName,
  getRelativeMentionPath,
  mentionsEqual,
  MENTION_DROPDOWN_LIMIT,
  MENTION_SEARCH_DEBOUNCE_MS,
  MENTION_SEARCH_LIMIT,
  rankProjectFiles,
  removeMentionBeforeCaret,
  replaceMentionToken,
  type MentionRange,
} from "@/lib/messages/composer-mentions";
import { getBrowserQueryClient } from "@/lib/query-client";
import { queryKeys } from "@/lib/query-keys";
import { useArtifactFilesStore } from "@/stores/artifact-files-store";
import { useChatSettingsStore } from "@/stores/chat-settings-store";
import { useChatStore } from "@/stores/chat-store";
import { useComposerStore } from "@/stores/composer-store";
import { useSessionsStore } from "@/stores/sessions-store";
import { useSidebarStore } from "@/stores/sidebar-store";

import type { SessionRef } from "@/stores/types";
import type { ProjectFileIndexEntryDto } from "@/lib/client-api";

const PDF_MIME_TYPE = "application/pdf";
const ATTACHMENT_ACCEPT = `image/*,${PDF_MIME_TYPE}`;
const EMPTY_ATTACHMENTS: Attachment[] = [];
const LOG_PREFIX = "[artifact-chat]";

function isAbortError(error: unknown): boolean {
  if (!error) {
    return false;
  }

  if (typeof DOMException !== "undefined" && error instanceof DOMException) {
    return error.name === "AbortError";
  }

  if (error instanceof Error) {
    return error.name === "AbortError" || error.message.toLowerCase().includes("abort");
  }

  return false;
}

function getErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Failed to send message.";
}

function isSupportedAttachmentFile(file: File): boolean {
  if (file.type === PDF_MIME_TYPE) {
    return true;
  }

  return file.type.startsWith("image/");
}

function formatAttachmentSize(size: number | undefined): string | null {
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

function getAttachmentSessionFallbackName(attachments: Attachment[]): string {
  if (attachments.length === 1) {
    return attachments[0]?.fileName ?? "Attachment";
  }

  return `${attachments.length} attachments`;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);

  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }

  return btoa(binary);
}

async function toAttachment(file: File): Promise<Attachment> {
  const content = arrayBufferToBase64(await file.arrayBuffer());

  return {
    id:
      typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    type: file.type === PDF_MIME_TYPE ? "file" : "image",
    fileName: file.name,
    mimeType: file.type || (file.name.toLowerCase().endsWith(".pdf") ? PDF_MIME_TYPE : ""),
    size: file.size,
    content,
  };
}

function eventHasFiles(event: {
  dataTransfer?: DataTransfer | null;
}): boolean {
  return Array.from(event.dataTransfer?.types ?? []).includes("Files");
}

function summarizeAttachments(attachments: Attachment[]): Array<{
  id: string;
  fileName: string;
  mimeType: string;
  size?: number;
  type: Attachment["type"];
}> {
  return attachments.map((attachment) => ({
    id: attachment.id,
    fileName: attachment.fileName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    type: attachment.type,
  }));
}

export function ArtifactChatComposer({
  projectId,
  artifactId,
  sessionId,
}: {
  projectId: string;
  artifactId: string;
  sessionId?: string;
}) {
  const router = useRouter();
  const [localDraft, setLocalDraft] = useState("");
  const [localAttachments, setLocalAttachments] = useState<Attachment[]>([]);
  const [activeMention, setActiveMention] = useState<MentionRange | null>(null);
  const [mentionResults, setMentionResults] = useState<ProjectFileIndexEntryDto[]>([]);
  const [mentionLoading, setMentionLoading] = useState(false);
  const [mentionError, setMentionError] = useState<string | null>(null);
  const [highlightedMentionIndex, setHighlightedMentionIndex] = useState(0);
  const [isDragActive, setIsDragActive] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepthRef = useRef(0);
  const activeMentionRef = useRef<MentionRange | null>(null);
  const mentionRequestIdRef = useRef(0);
  const currentSession = sessionId ? ({ sessionId } satisfies SessionRef) : null;

  const composerDraft = useComposerStore((state) =>
    sessionId ? (state.draftsBySession[sessionId] ?? "") : "",
  );
  const composerAttachments = useComposerStore((state) =>
    sessionId ? (state.attachmentsBySession[sessionId] ?? EMPTY_ATTACHMENTS) : EMPTY_ATTACHMENTS,
  );
  const editState = useComposerStore((state) =>
    sessionId ? (state.editStateBySession[sessionId] ?? null) : null,
  );
  const setComposerDraft = useComposerStore((state) => state.setDraft);
  const addComposerAttachment = useComposerStore((state) => state.addAttachment);
  const removeComposerAttachment = useComposerStore((state) => state.removeAttachment);
  const markSubmitted = useComposerStore((state) => state.markSubmitted);
  const cancelEdit = useComposerStore((state) => state.cancelEdit);
  const clearEditState = useComposerStore((state) => state.clearEditState);

  const selectedModelId = useChatSettingsStore((state) => state.modelId);
  const selectedReasoning = useChatSettingsStore((state) => state.reasoningEffort);

  const createSession = useSessionsStore((state) => state.createSession);
  const searchProjectFiles = useArtifactFilesStore((state) => state.searchProjectFiles);
  const startStream = useChatStore((state) => state.startStream);
  const editFromNode = useChatStore((state) => state.editFromNode);
  const setActiveSession = useChatStore((state) => state.setActiveSession);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const abortStream = useChatStore((state) => state.abortStream);
  const isStreaming = useChatStore((state) =>
    sessionId ? (state.isStreamingBySession[sessionId] ?? false) : false,
  );

  const sidebarAddSession = useSidebarStore((state) => state.addSession);
  const sidebarRenameSession = useSidebarStore((state) => state.renameSession);

  const draft = currentSession ? composerDraft : localDraft;
  const attachments = currentSession ? composerAttachments : localAttachments;
  const isEditing = Boolean(currentSession && editState);
  const attachmentsAreLocked = Boolean(editState?.hasFixedAttachments);
  const placeholderText = currentSession ? "Ask me anything..." : "Ask about this artifact or start a thread…";
  const canSubmit = draft.trim().length > 0 || attachments.length > 0;
  const isMentionOpen = activeMention !== null;

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      return;
    }

    textarea.style.height = "0px";
    textarea.style.height = `${Math.min(textarea.scrollHeight, 220)}px`;
  }, [draft]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setMentionState(null);
      return;
    }

    syncMentionFromTextarea(textarea);
  }, [draft]);

  useEffect(() => {
    if (!activeMention) {
      return undefined;
    }

    const currentRequestId = mentionRequestIdRef.current + 1;
    mentionRequestIdRef.current = currentRequestId;

    const runSearch = async () => {
      try {
        setMentionLoading(true);
        setMentionError(null);
        const files = await searchProjectFiles(
          projectId,
          activeMention.query,
          MENTION_SEARCH_LIMIT,
        );
        if (mentionRequestIdRef.current !== currentRequestId) {
          return;
        }

        const ranked = rankProjectFiles(files, activeMention.query).slice(
          0,
          MENTION_DROPDOWN_LIMIT,
        );
        setMentionResults(ranked);
        setHighlightedMentionIndex((current) => {
          if (ranked.length === 0) {
            return 0;
          }

          return Math.min(current, ranked.length - 1);
        });
      } catch (error) {
        if (mentionRequestIdRef.current !== currentRequestId) {
          return;
        }

        const message = error instanceof Error ? error.message : "Failed to load files.";
        setMentionResults([]);
        setMentionError(message);
      } finally {
        if (mentionRequestIdRef.current === currentRequestId) {
          setMentionLoading(false);
        }
      }
    };

    const debounceMs =
      activeMention.query.trim().length === 0 ? 0 : MENTION_SEARCH_DEBOUNCE_MS;
    const timeout = window.setTimeout(() => {
      void runSearch();
    }, debounceMs);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [activeMention, projectId, searchProjectFiles]);

  function setMentionState(nextMention: MentionRange | null) {
    if (mentionsEqual(activeMentionRef.current, nextMention)) {
      return;
    }

    activeMentionRef.current = nextMention;
    setActiveMention(nextMention);

    if (!nextMention) {
      setMentionResults([]);
      setMentionError(null);
      setMentionLoading(false);
      setHighlightedMentionIndex(0);
      return;
    }

    setMentionError(null);
    setHighlightedMentionIndex(0);
  }

  function syncActiveMention(value: string, caret: number | null) {
    const resolvedCaret = caret ?? value.length;
    const nextMention = extractActiveMention(value, resolvedCaret);
    setMentionState(nextMention);
  }

  function syncMentionFromTextarea(textarea: HTMLTextAreaElement) {
    textareaRef.current = textarea;
    syncActiveMention(textarea.value, textarea.selectionStart);
  }

  function handleInputChange(nextValue: string) {
    if (currentSession) {
      setComposerDraft({
        session: currentSession,
        draft: nextValue,
      });
      return;
    }

    setLocalDraft(nextValue);
  }

  function handleAttachmentAdd(attachment: Attachment) {
    if (attachmentsAreLocked) {
      toast.error("Attachments are fixed while editing this message.", {
        id: "artifact-edit-attachment-locked",
      });
      return;
    }

    if (currentSession) {
      addComposerAttachment({
        session: currentSession,
        attachment,
      });
      return;
    }

    setLocalAttachments((current) => {
      if (current.some((candidate) => candidate.id === attachment.id)) {
        return current;
      }

      return [...current, attachment];
    });
  }

  function handleAttachmentRemove(attachmentId: string) {
    if (attachmentsAreLocked) {
      toast.error("Attachments are fixed while editing this message.", {
        id: "artifact-edit-attachment-locked",
      });
      return;
    }

    if (currentSession) {
      removeComposerAttachment({
        session: currentSession,
        attachmentId,
      });
      return;
    }

    setLocalAttachments((current) => current.filter((attachment) => attachment.id !== attachmentId));
  }

  async function handleAttachmentFiles(files: FileList | File[]) {
    if (attachmentsAreLocked) {
      toast.error("Attachments are fixed while editing this message.", {
        id: "artifact-edit-attachment-locked",
      });
      return;
    }

    const nextFiles = Array.from(files);
    if (nextFiles.length === 0) {
      return;
    }

    const supported = nextFiles.filter(isSupportedAttachmentFile);
    const rejected = nextFiles.filter((file) => !isSupportedAttachmentFile(file));

    if (rejected.length > 0) {
      toast.error("Only images and PDFs are supported.", {
        id: "artifact-attachment-type-error",
      });
    }

    try {
      const nextAttachments = await Promise.all(supported.map((file) => toAttachment(file)));
      for (const attachment of nextAttachments) {
        handleAttachmentAdd(attachment);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to read attachment.";
      toast.error(message, {
        id: "artifact-attachment-read-error",
      });
    } finally {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  }

  function handleMentionSelect(entry: ProjectFileIndexEntryDto) {
    if (!activeMention) {
      return;
    }

    const mentionToken = `@${getRelativeMentionPath(artifactId, entry)}`;
    const nextMentionedValue = replaceMentionToken(draft, activeMention, mentionToken);
    handleInputChange(nextMentionedValue.value);
    setMentionState(null);

    window.requestAnimationFrame(() => {
      const textarea = textareaRef.current;
      if (!textarea) {
        return;
      }

      textarea.focus();
      textarea.setSelectionRange(nextMentionedValue.cursor, nextMentionedValue.cursor);
    });
  }

  function handleTextareaInteraction(event: { currentTarget: HTMLTextAreaElement }) {
    syncMentionFromTextarea(event.currentTarget);
  }

  function handleTextareaKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Backspace" && !event.metaKey && !event.ctrlKey && !event.altKey) {
      const textarea = event.currentTarget;
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;

      if (selectionStart !== null && selectionEnd !== null && selectionStart === selectionEnd) {
        const removal = removeMentionBeforeCaret(textarea.value, selectionStart);
        if (removal) {
          event.preventDefault();
          handleInputChange(removal.value);
          setMentionState(null);
          window.requestAnimationFrame(() => {
            const nextTextarea = textareaRef.current;
            if (!nextTextarea) {
              return;
            }

            nextTextarea.focus();
            nextTextarea.setSelectionRange(removal.cursor, removal.cursor);
          });
          return;
        }
      }
    }

    if (!isMentionOpen) {
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setMentionState(null);
      return;
    }

    if (mentionResults.length === 0) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlightedMentionIndex((current) => (current + 1) % mentionResults.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlightedMentionIndex((current) =>
        current === 0 ? mentionResults.length - 1 : Math.max(0, current - 1),
      );
      return;
    }

    if ((event.key === "Enter" && !event.shiftKey) || event.key === "Tab") {
      event.preventDefault();
      const selected = mentionResults[highlightedMentionIndex];
      if (selected) {
        handleMentionSelect(selected);
      }
    }
  }

  async function handleSubmit() {
    const prompt = draft.trim();
    if ((!canSubmit && !isStreaming) || (!sessionId && isStreaming)) {
      return;
    }

    if (currentSession && isStreaming) {
      try {
        console.debug(LOG_PREFIX, "abort requested", {
          sessionId,
          projectId,
          artifactId,
        });
        await abortStream({
          session: currentSession,
          projectId,
          artifactId,
        });
      } catch (error) {
        if (isAbortError(error)) {
          return;
        }

        toast.error(getErrorMessage(error), {
          id: "artifact-stop-error",
        });
      }
      return;
    }

    try {
      if (currentSession) {
        if (editState) {
          console.debug(LOG_PREFIX, "submit edit", {
            sessionId: currentSession.sessionId,
            projectId,
            artifactId,
            targetNodeId: editState.targetNodeId,
            prompt,
            modelId: selectedModelId,
            reasoningEffort: selectedReasoning,
          });

          setComposerDraft({
            session: currentSession,
            draft: "",
          });
          setMentionState(null);

          await editFromNode({
            sessionId: currentSession.sessionId,
            nodeId: editState.targetNodeId,
            prompt,
            projectId,
            artifactId,
            modelId: selectedModelId,
            reasoningEffort: selectedReasoning,
          });

          clearEditState(currentSession);
          return;
        }

        const submittedAttachments = attachments;
        markSubmitted(currentSession);
        setMentionState(null);

        console.debug(LOG_PREFIX, "submit existing session", {
          sessionId: currentSession.sessionId,
          projectId,
          artifactId,
          prompt,
          modelId: selectedModelId,
          reasoningEffort: selectedReasoning,
          attachments: summarizeAttachments(submittedAttachments),
        });

        await startStream({
          sessionId: currentSession.sessionId,
          prompt,
          ...(submittedAttachments.length > 0 ? { attachments: submittedAttachments } : {}),
          projectId,
          artifactId,
          modelId: selectedModelId,
          reasoningEffort: selectedReasoning,
        });
        return;
      }

      const submittedAttachments = attachments;
      const initialSessionName =
        prompt.length > 0 ? "New chat" : getAttachmentSessionFallbackName(submittedAttachments);

      console.debug(LOG_PREFIX, "create session before send", {
        projectId,
        artifactId,
        initialSessionName,
        modelId: selectedModelId,
        reasoningEffort: selectedReasoning,
        prompt,
        attachments: summarizeAttachments(submittedAttachments),
      });

      const created = await createSession(
        { projectId, artifactId },
        {
          sessionName: initialSessionName,
          modelId: selectedModelId,
        },
      );

      const nextSession = {
        sessionId: created.sessionId,
      } satisfies SessionRef;

      console.debug(LOG_PREFIX, "created session", {
        sessionId: created.sessionId,
        route: `/${projectId}/${artifactId}/${created.sessionId}`,
      });

      setActiveSession(nextSession);
      sidebarAddSession(artifactId, {
        sessionId: created.sessionId,
        sessionName: initialSessionName,
        createdAt: new Date().toISOString(),
        updatedAt: null,
        nodeCount: 0,
      });

      setLocalDraft("");
      setLocalAttachments([]);
      setMentionState(null);

      router.push(`/${projectId}/${artifactId}/${created.sessionId}`);
      await loadMessages({
        session: nextSession,
        projectId,
        artifactId,
        force: true,
      });

      console.debug(LOG_PREFIX, "start stream after create", {
        sessionId: created.sessionId,
        prompt,
        modelId: selectedModelId,
        reasoningEffort: selectedReasoning,
        attachments: summarizeAttachments(submittedAttachments),
      });

      await startStream({
        sessionId: created.sessionId,
        prompt,
        ...(submittedAttachments.length > 0 ? { attachments: submittedAttachments } : {}),
        projectId,
        artifactId,
        modelId: selectedModelId,
        reasoningEffort: selectedReasoning,
      });

      if (prompt.length > 0) {
        void generateSessionName(
          {
            projectId,
            artifactId,
          },
          {
            sessionId: created.sessionId,
            query: prompt,
          },
        )
          .then((result) => {
            console.debug(LOG_PREFIX, "generated session name", result);
            sidebarRenameSession(created.sessionId, result.sessionName);

            const queryClient = getBrowserQueryClient();
            void Promise.all([
              queryClient.invalidateQueries({
                queryKey: queryKeys.sessions.list({ projectId, artifactId }),
              }),
              queryClient.invalidateQueries({
                queryKey: queryKeys.sessions.scope({ projectId, artifactId }, created.sessionId),
              }),
              queryClient.invalidateQueries({
                queryKey: queryKeys.projects.overview(projectId),
              }),
            ]);
          })
          .catch((error) => {
            console.debug(LOG_PREFIX, "generate session name failed", error);
          });
      }
    } catch (error) {
      if (isAbortError(error)) {
        return;
      }

      if (currentSession && editState) {
        setComposerDraft({
          session: currentSession,
          draft: prompt,
        });
      }

      toast.error(getErrorMessage(error), {
        id: "artifact-send-error",
      });
    }
  }

  return (
    <PromptInput
      value={draft}
      onValueChange={handleInputChange}
      onSubmit={() => {
        void handleSubmit();
      }}
      className="relative w-full backdrop-blur-sm"
      onDragEnter={(event) => {
        if (attachmentsAreLocked) {
          return;
        }

        if (!eventHasFiles(event)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current += 1;
        setIsDragActive(true);
      }}
      onDragOver={(event) => {
        if (attachmentsAreLocked) {
          return;
        }

        if (!eventHasFiles(event)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        event.dataTransfer.dropEffect = "copy";
      }}
      onDragLeave={(event) => {
        if (attachmentsAreLocked) {
          return;
        }

        if (!eventHasFiles(event)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
        if (dragDepthRef.current === 0) {
          setIsDragActive(false);
        }
      }}
      onDrop={(event) => {
        if (attachmentsAreLocked) {
          return;
        }

        if (!eventHasFiles(event)) {
          return;
        }

        event.preventDefault();
        event.stopPropagation();
        dragDepthRef.current = 0;
        setIsDragActive(false);
        void handleAttachmentFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={fileInputRef}
        type="file"
        accept={ATTACHMENT_ACCEPT}
        multiple
        className="hidden"
        onChange={(event) => {
          if (!event.target.files) {
            return;
          }

          void handleAttachmentFiles(event.target.files);
        }}
      />

      {isEditing && currentSession ? (
        <div className="flex items-center justify-between px-1 pb-1 text-[11px] text-black/44 dark:text-white/42">
          <span>Editing earlier message</span>
          <button
            type="button"
            onClick={() => cancelEdit(currentSession)}
            className="text-black/48 transition-colors hover:text-black/72 dark:text-white/46 dark:hover:text-white/72"
          >
            Cancel
          </button>
        </div>
      ) : null}

      {attachments.length > 0 ? (
        <div className="mb-2 flex flex-wrap gap-2 px-1">
          {attachments.map((attachment) => {
            const sizeLabel = formatAttachmentSize(attachment.size);
            const dataUrl = `data:${attachment.mimeType};base64,${attachment.content}`;

            if (attachment.type === "image") {
              return (
                <div
                  key={attachment.id}
                  className="relative overflow-hidden rounded-2xl border border-black/8 bg-accent dark:border-white/10"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={dataUrl}
                    alt={attachment.fileName}
                    className="h-14 w-14 object-cover"
                  />
                  <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5">
                    <div className="truncate text-[9px] font-medium text-white">
                      {attachment.fileName}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAttachmentRemove(attachment.id)}
                    disabled={attachmentsAreLocked}
                    className="absolute right-1 top-1 inline-flex size-5 items-center justify-center rounded-full bg-black/55 text-[0.82rem] font-medium text-white transition-colors hover:bg-black/70 disabled:opacity-40"
                    aria-label={`Remove ${attachment.fileName}`}
                  >
                    ×
                  </button>
                </div>
              );
            }

            return (
              <div
                key={attachment.id}
                className="flex min-w-[168px] max-w-[220px] items-center gap-2 rounded-2xl border border-black/8 bg-accent px-2.5 py-1.5 text-black dark:border-white/10 dark:text-white"
              >
                <div className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#FF6363]/12 text-[#FF6363]">
                  <HugeiconsIcon
                    icon={Pdf02Icon}
                    size={16}
                    color="currentColor"
                    strokeWidth={1.8}
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[0.8rem] font-medium leading-5">
                    {attachment.fileName}
                  </div>
                  <div className="text-[0.67rem] leading-4 text-black/45 dark:text-white/42">
                    {sizeLabel ?? "Document"}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleAttachmentRemove(attachment.id)}
                  disabled={attachmentsAreLocked}
                  className="inline-flex h-6 w-6 items-center justify-center rounded-full text-xs text-black/48 transition-colors hover:bg-black/6 hover:text-black/72 disabled:cursor-default disabled:opacity-40 dark:text-white/46 dark:hover:bg-white/8 dark:hover:text-white/72"
                  aria-label={`Remove ${attachment.fileName}`}
                >
                  ×
                </button>
              </div>
            );
          })}
        </div>
      ) : null}

      {isMentionOpen ? (
        <div className="absolute inset-x-0 bottom-full z-40 mb-2 rounded-2xl border border-black/10 bg-white/94 p-1.5 shadow-xl backdrop-blur-md dark:border-white/10 dark:bg-[#101011]/94">
          <div className="max-h-64 overflow-y-auto">
            {mentionLoading ? (
              <p className="px-2.5 py-1.5 text-xs text-black/44 dark:text-white/42">
                Searching files...
              </p>
            ) : mentionError ? (
              <p className="px-2.5 py-1.5 text-xs text-[#FF6363]">{mentionError}</p>
            ) : mentionResults.length === 0 ? (
              <p className="px-2.5 py-1.5 text-xs text-black/44 dark:text-white/42">
                No matching files.
              </p>
            ) : (
              mentionResults.map((entry, index) => (
                <button
                  key={entry.artifactPath}
                  type="button"
                  onMouseDown={(event) => {
                    event.preventDefault();
                    handleMentionSelect(entry);
                  }}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-xl px-2.5 py-1.5 text-left transition-colors",
                    index === highlightedMentionIndex
                      ? "bg-black/[0.06] dark:bg-white/[0.08]"
                      : "hover:bg-black/[0.04] dark:hover:bg-white/[0.05]",
                  )}
                >
                  <HugeiconsIcon
                    icon={entry.type === "directory" ? Folder01Icon : File01Icon}
                    size={15}
                    color="currentColor"
                    strokeWidth={1.8}
                    className="shrink-0 text-black/42 dark:text-white/42"
                  />
                  <span className="min-w-0 truncate text-sm font-medium text-black dark:text-white">
                    {getIndexedEntryDisplayName(entry)}
                  </span>
                  <span className="min-w-0 truncate text-xs text-black/42 dark:text-white/40">
                    {buildFileLabel(entry)}
                  </span>
                </button>
              ))
            )}
          </div>
        </div>
      ) : null}

      <PromptInputTextarea
        data-chat-composer-textarea
        ref={textareaRef}
        placeholder={isEditing ? "Edit your message…" : placeholderText}
        className="px-1 py-2 text-[15px] leading-[1.8] placeholder:text-black/30 dark:placeholder:text-white/24"
        maxLength={200000}
        onChange={handleTextareaInteraction}
        onSelect={handleTextareaInteraction}
        onClick={handleTextareaInteraction}
        onFocus={handleTextareaInteraction}
        onKeyUp={handleTextareaInteraction}
        onKeyDown={handleTextareaKeyDown}
      />

      <PromptInputActions className="justify-between gap-2 px-1 pt-4">
        <div className="flex min-w-0 items-center gap-0.5">
          <button
            type="button"
            onClick={() => {
              if (attachmentsAreLocked) {
                toast.error("Attachments are fixed while editing this message.", {
                  id: "artifact-edit-attachment-locked",
                });
                return;
              }

              fileInputRef.current?.click();
            }}
            disabled={attachmentsAreLocked}
            className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-black/38 transition-colors hover:bg-accent hover:text-black/64 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 disabled:cursor-default disabled:opacity-35 dark:text-white/36 dark:hover:text-white/64 dark:focus-visible:ring-white/12"
            aria-label="Add attachment"
            title={
              attachmentsAreLocked
                ? "Attachments are fixed while editing this message"
                : "Add attachment"
            }
          >
            <HugeiconsIcon
              icon={PlusSignIcon}
              size={18}
              color="currentColor"
              strokeWidth={1.9}
            />
          </button>

          <PromptModelPicker />
          <PromptReasoningPicker />
        </div>

        <button
          type="button"
          onClick={() => {
            void handleSubmit();
          }}
          disabled={!isStreaming && !canSubmit}
          className={[
            "inline-flex h-8 w-8 items-center justify-center rounded-full transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 disabled:cursor-not-allowed dark:focus-visible:ring-white/12",
            isStreaming || canSubmit
              ? "bg-[#FF6363] text-white hover:bg-[#f25454]"
              : "bg-accent text-black/28 dark:text-white/26",
          ].join(" ")}
          aria-label={isStreaming ? "Stop generation" : "Send prompt"}
          title={isStreaming ? "Stop generation" : "Send prompt"}
        >
          {isStreaming ? (
            <span className="h-3 w-3 rounded-[2px] bg-current" />
          ) : (
            <HugeiconsIcon
              icon={ArrowUp02Icon}
              size={16}
              color="currentColor"
              strokeWidth={1.9}
            />
          )}
        </button>
      </PromptInputActions>

      {isDragActive ? (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-3xl border border-dashed border-black/18 bg-white/72 text-sm text-black/72 backdrop-blur-sm dark:border-white/22 dark:bg-black/28 dark:text-white/78">
          {attachmentsAreLocked
            ? "Attachments are fixed while editing this message"
            : "Drop images or PDFs to attach"}
        </div>
      ) : null}
    </PromptInput>
  );
}
