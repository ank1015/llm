'use client';

import { ArrowUp, FileText, Globe, Paperclip, Square, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import type { SessionRef } from '@/lib/contracts';
import type { Attachment } from '@ank1015/llm-sdk';

import {
  PromptInput,
  PromptInputAction,
  PromptInputActions,
  PromptInputTextarea,
} from '@/components/ai/prompt-input';
import { Button } from '@/components/ui/button';
import { useChatSettingsStore } from '@/stores/chat-settings-store';
import { useChatStore } from '@/stores/chat-store';
import { useProvidersStore } from '@/stores/providers-store';
import { useSessionsStore } from '@/stores/sessions-store';


function createAttachmentId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      if (typeof reader.result !== 'string') {
        reject(new Error(`Could not read file: ${file.name}`));
        return;
      }

      const [, base64 = ''] = reader.result.split(',', 2);
      resolve(base64);
    };

    reader.onerror = () => {
      reject(new Error(`Could not read file: ${file.name}`));
    };

    reader.readAsDataURL(file);
  });
}

async function toAttachment(file: File): Promise<Attachment> {
  const base64 = await fileToBase64(file);
  const mimeType = file.type.trim() || 'application/octet-stream';

  return {
    id: createAttachmentId(),
    type: mimeType.startsWith('image/') ? 'image' : 'file',
    fileName: file.name || 'file',
    mimeType,
    size: file.size,
    content: base64,
  };
}

function isAbortError(error: unknown): boolean {
  if (!error) return false;

  if (typeof DOMException !== 'undefined' && error instanceof DOMException) {
    return error.name === 'AbortError';
  }

  if (error instanceof Error) {
    return error.name === 'AbortError' || error.message.toLowerCase().includes('abort');
  }

  return false;
}

function getSessionKey(session: SessionRef): string {
  const projectName = session.projectName?.trim() ?? '';
  const path = session.path?.trim() ?? '';
  return `${projectName}::${path}::${session.sessionId}`;
}

const ACCEPTED_FILE_TYPES = 'image/*,.pdf';

function isImageFile(file: File): boolean {
  return file.type.startsWith('image/');
}

function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf');
}

function isAllowedFile(file: File): boolean {
  return isImageFile(file) || isPdfFile(file);
}

export function PromptInputWithActions() {
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [useWebSearch, setUseWebSearch] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uploadInputRef = useRef<HTMLInputElement>(null);

  const previewUrls = useMemo(
    () => files.map((file) => (isImageFile(file) ? URL.createObjectURL(file) : null)),
    [files]
  );

  useEffect(() => {
    return () => {
      for (const url of previewUrls) {
        if (url) URL.revokeObjectURL(url);
      }
    };
  }, [previewUrls]);

  const activeSession = useChatStore((state) => state.activeSession);
  const startStream = useChatStore((state) => state.startStream);
  const abortStream = useChatStore((state) => state.abortStream);
  const loadMessages = useChatStore((state) => state.loadMessages);
  const setActiveSession = useChatStore((state) => state.setActiveSession);

  const isStreaming = useChatStore((state) => {
    if (!activeSession) return false;
    const key = getSessionKey(activeSession);
    return state.isStreamingBySession[key] ?? false;
  });

  const getEffectiveSettings = useChatSettingsStore((state) => state.getEffectiveSettings);
  const selectedApi = useProvidersStore((state) => state.selectedApi);
  const selectedModelId = useProvidersStore((state) => state.selectedModelId);
  const createSession = useSessionsStore((state) => state.createSession);

  const handleSubmit = async () => {
    const trimmed = input.trim();
    if (trimmed === '' || isStreaming) return;

    setError(null);

    try {
      let session: SessionRef | undefined = activeSession ?? undefined;

      if (!session) {
        const created = await createSession({ sessionName: 'New chat' });
        setActiveSession(created);
        await loadMessages({ session: created, force: true });
        session = created;
      }

      if (!session) {
        throw new Error('Could not create or select a session.');
      }

      const settings = getEffectiveSettings(session);
      const api = settings.api ?? selectedApi;
      const modelId = settings.modelId ?? selectedModelId;

      if (!api || !modelId) {
        throw new Error('Select a provider and model before sending a message.');
      }

      let attachments: Attachment[] | undefined;
      if (files.length > 0) {
        attachments = await Promise.all(files.map(toAttachment));
      }

      const providerOptions: Record<string, unknown> = {
        ...settings.providerOptions,
      };
      if (useWebSearch) {
        providerOptions.useWebSearch = true;
      }

      setInput('');
      setFiles([]);

      await startStream({
        sessionId: session.sessionId,
        projectName: session.projectName,
        path: session.path,
        prompt: trimmed,
        api,
        modelId,
        systemPrompt: settings.systemPrompt.trim().length > 0 ? settings.systemPrompt : undefined,
        providerOptions: Object.keys(providerOptions).length > 0 ? providerOptions : undefined,
        attachments,
      });
    } catch (err) {
      if (isAbortError(err)) return;

      const message = err instanceof Error ? err.message : 'Failed to send message.';
      setError(message);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      const newFiles = Array.from(event.target.files).filter(isAllowedFile);
      setFiles((prev) => [...prev, ...newFiles]);
    }
  };

  const handleRemoveFile = (index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
    if (uploadInputRef?.current) {
      uploadInputRef.current.value = '';
    }
  };

  const toggleWebSearch = () => {
    setUseWebSearch((prev) => !prev);
  };

  const handleStop = () => {
    if (activeSession) {
      abortStream(activeSession);
    }
  };

  return (
    <PromptInput
      value={input}
      onValueChange={setInput}
      isLoading={isStreaming}
      onSubmit={handleSubmit}
      className="w-full max-w-(--breakpoint-md)"
    >
      {files.length > 0 && (
        <div className="flex flex-wrap gap-2 px-2 pb-2">
          {files.map((file, index) => (
            <div
              key={`${file.name}-${index}`}
              className="group relative size-16 overflow-hidden rounded-lg border border-border bg-secondary"
              onClick={(e) => e.stopPropagation()}
            >
              {previewUrls[index] ? (
                <img src={previewUrls[index]} alt={file.name} className="size-full object-cover" />
              ) : (
                <div className="flex size-full flex-col items-center justify-center gap-0.5">
                  <FileText className="size-6 text-red-500" />
                  <span className="text-[9px] font-medium text-muted-foreground">PDF</span>
                </div>
              )}
              <button
                type="button"
                onClick={() => handleRemoveFile(index)}
                className="absolute right-0.5 top-0.5 rounded-full bg-black/60 p-0.5 text-white opacity-0 transition-opacity group-hover:opacity-100"
              >
                <X className="size-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <PromptInputTextarea placeholder="Ask me anything..." />

      <PromptInputActions className="flex items-center justify-between gap-2 pt-4">
        <div className="flex items-center gap-2">
          <PromptInputAction tooltip="Attach files">
            <label
              htmlFor="file-upload"
              className="hover:bg-secondary-foreground/10 flex h-8 w-8 cursor-pointer items-center justify-center rounded-2xl"
            >
              <input
                ref={uploadInputRef}
                type="file"
                multiple
                accept={ACCEPTED_FILE_TYPES}
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
              />
              <Paperclip className="text-primary size-5" />
            </label>
          </PromptInputAction>

          <PromptInputAction tooltip="Search the web">
            <Button
              onClick={toggleWebSearch}
              variant="outline"
              className={`rounded-full ${
                useWebSearch
                  ? 'text-blue-500 bg-blue-500/10 hover:bg-blue-500/10 hover:text-blue-500 border-blue-500/10'
                  : ''
              }`}
            >
              <Globe size={18} />
              Search
            </Button>
          </PromptInputAction>
        </div>

        <PromptInputAction tooltip={isStreaming ? 'Stop generation' : 'Send message'}>
          <Button
            variant="default"
            size="icon"
            className="h-8 w-8 rounded-full cursor-pointer"
            onClick={isStreaming ? handleStop : handleSubmit}
          >
            {isStreaming ? (
              <Square className="size-3 fill-current" />
            ) : (
              <ArrowUp className="size-4" />
            )}
          </Button>
        </PromptInputAction>
      </PromptInputActions>

      {error ? <p className="mt-2 text-xs text-red-500">{error}</p> : null}
    </PromptInput>
  );
}
