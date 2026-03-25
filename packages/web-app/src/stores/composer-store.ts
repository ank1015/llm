'use client';

import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';

import type { SessionRef } from '@/lib/client-api';
import type { Attachment } from '@ank1015/llm-types';

type ComposerSnapshot = {
  draft: string;
  attachments: Attachment[];
  isDirty: boolean;
};

type ComposerEditState = {
  targetNodeId: string;
  originalText: string;
  hasFixedAttachments: boolean;
  previousDraft: string;
  previousAttachments: Attachment[];
};

type ComposerStoreState = {
  activeSession: SessionRef | null;
  draftsBySession: Record<string, string>;
  attachmentsBySession: Record<string, Attachment[]>;
  isDirtyBySession: Record<string, boolean>;
  editStateBySession: Record<string, ComposerEditState | null>;
  setActiveSession: (session: SessionRef | null) => void;
  setDraft: (input: { session?: SessionRef; draft: string }) => void;
  appendToDraft: (input: { session?: SessionRef; text: string }) => void;
  clearDraft: (session?: SessionRef) => void;
  setAttachments: (input: { session?: SessionRef; attachments: Attachment[] }) => void;
  addAttachment: (input: { session?: SessionRef; attachment: Attachment }) => void;
  removeAttachment: (input: { session?: SessionRef; attachmentId: string }) => void;
  clearAttachments: (session?: SessionRef) => void;
  markSubmitted: (session?: SessionRef) => void;
  getSnapshot: (session?: SessionRef) => ComposerSnapshot;
  beginEdit: (input: {
    session?: SessionRef;
    targetNodeId: string;
    originalText: string;
    hasFixedAttachments?: boolean;
  }) => void;
  cancelEdit: (session?: SessionRef) => void;
  clearEditState: (session?: SessionRef) => void;
  resetSessionComposer: (session: SessionRef) => void;
  reset: () => void;
};

const initialState = {
  activeSession: null as SessionRef | null,
  draftsBySession: {} as Record<string, string>,
  attachmentsBySession: {} as Record<string, Attachment[]>,
  isDirtyBySession: {} as Record<string, boolean>,
  editStateBySession: {} as Record<string, ComposerEditState | null>,
};

function getSessionKey(session: SessionRef): string {
  return session.sessionId;
}

function resolveSessionRef(
  session: SessionRef | undefined,
  activeSession: SessionRef | null
): SessionRef | undefined {
  return session ?? activeSession ?? undefined;
}

function ensureUniqueAttachments(attachments: Attachment[]): Attachment[] {
  const seen = new Set<string>();
  const unique: Attachment[] = [];

  for (const attachment of attachments) {
    if (seen.has(attachment.id)) {
      continue;
    }

    seen.add(attachment.id);
    unique.push(attachment);
  }

  return unique;
}

export const useComposerStore = create<ComposerStoreState>()(
  persist(
    (set, get) => ({
      ...initialState,

      setActiveSession: (session) => {
        if (!session) {
          set({ activeSession: null });
          return;
        }

        const key = getSessionKey(session);

        set((state) => ({
          activeSession: session,
          draftsBySession: {
            ...state.draftsBySession,
            [key]: state.draftsBySession[key] ?? '',
          },
          attachmentsBySession: {
            ...state.attachmentsBySession,
            [key]: state.attachmentsBySession[key] ?? [],
          },
          isDirtyBySession: {
            ...state.isDirtyBySession,
            [key]: state.isDirtyBySession[key] ?? false,
          },
          editStateBySession: {
            ...state.editStateBySession,
            [key]: state.editStateBySession[key] ?? null,
          },
        }));
      },

      setDraft: ({ session, draft }) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const key = getSessionKey(resolvedSession);

        set((state) => ({
          draftsBySession: {
            ...state.draftsBySession,
            [key]: draft,
          },
          isDirtyBySession: {
            ...state.isDirtyBySession,
            [key]: draft.length > 0 || (state.attachmentsBySession[key]?.length ?? 0) > 0,
          },
        }));
      },

      appendToDraft: ({ session, text }) => {
        if (text.length === 0) {
          return;
        }

        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const key = getSessionKey(resolvedSession);

        set((state) => {
          const currentDraft = state.draftsBySession[key] ?? '';
          const nextDraft = currentDraft + text;

          return {
            draftsBySession: {
              ...state.draftsBySession,
              [key]: nextDraft,
            },
            isDirtyBySession: {
              ...state.isDirtyBySession,
              [key]: true,
            },
          };
        });
      },

      clearDraft: (session) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const key = getSessionKey(resolvedSession);

        set((state) => ({
          draftsBySession: {
            ...state.draftsBySession,
            [key]: '',
          },
          isDirtyBySession: {
            ...state.isDirtyBySession,
            [key]: (state.attachmentsBySession[key]?.length ?? 0) > 0,
          },
        }));
      },

      setAttachments: ({ session, attachments }) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const key = getSessionKey(resolvedSession);
        const uniqueAttachments = ensureUniqueAttachments(attachments);

        set((state) => ({
          attachmentsBySession: {
            ...state.attachmentsBySession,
            [key]: uniqueAttachments,
          },
          isDirtyBySession: {
            ...state.isDirtyBySession,
            [key]: (state.draftsBySession[key] ?? '').length > 0 || uniqueAttachments.length > 0,
          },
        }));
      },

      addAttachment: ({ session, attachment }) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const key = getSessionKey(resolvedSession);

        set((state) => {
          const current = state.attachmentsBySession[key] ?? [];
          const next = ensureUniqueAttachments([...current, attachment]);

          return {
            attachmentsBySession: {
              ...state.attachmentsBySession,
              [key]: next,
            },
            isDirtyBySession: {
              ...state.isDirtyBySession,
              [key]: true,
            },
          };
        });
      },

      removeAttachment: ({ session, attachmentId }) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const key = getSessionKey(resolvedSession);

        set((state) => {
          const current = state.attachmentsBySession[key] ?? [];
          const next = current.filter((attachment) => attachment.id !== attachmentId);

          return {
            attachmentsBySession: {
              ...state.attachmentsBySession,
              [key]: next,
            },
            isDirtyBySession: {
              ...state.isDirtyBySession,
              [key]: (state.draftsBySession[key] ?? '').length > 0 || next.length > 0,
            },
          };
        });
      },

      clearAttachments: (session) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const key = getSessionKey(resolvedSession);

        set((state) => ({
          attachmentsBySession: {
            ...state.attachmentsBySession,
            [key]: [],
          },
          isDirtyBySession: {
            ...state.isDirtyBySession,
            [key]: (state.draftsBySession[key] ?? '').length > 0,
          },
        }));
      },

      markSubmitted: (session) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const key = getSessionKey(resolvedSession);

        set((state) => ({
          draftsBySession: {
            ...state.draftsBySession,
            [key]: '',
          },
          attachmentsBySession: {
            ...state.attachmentsBySession,
            [key]: [],
          },
          isDirtyBySession: {
            ...state.isDirtyBySession,
            [key]: false,
          },
        }));
      },

      getSnapshot: (session) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return {
            draft: '',
            attachments: [],
            isDirty: false,
          };
        }

        const key = getSessionKey(resolvedSession);
        const state = get();

        return {
          draft: state.draftsBySession[key] ?? '',
          attachments: state.attachmentsBySession[key] ?? [],
          isDirty: state.isDirtyBySession[key] ?? false,
        };
      },

      beginEdit: ({ session, targetNodeId, originalText, hasFixedAttachments = false }) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const key = getSessionKey(resolvedSession);

        set((state) => {
          const existingEditState = state.editStateBySession[key];
          const previousDraft =
            existingEditState?.previousDraft ?? state.draftsBySession[key] ?? '';
          const previousAttachments =
            existingEditState?.previousAttachments ?? state.attachmentsBySession[key] ?? [];

          return {
            draftsBySession: {
              ...state.draftsBySession,
              [key]: originalText,
            },
            attachmentsBySession: {
              ...state.attachmentsBySession,
              [key]: [],
            },
            isDirtyBySession: {
              ...state.isDirtyBySession,
              [key]: originalText.length > 0,
            },
            editStateBySession: {
              ...state.editStateBySession,
              [key]: {
                targetNodeId,
                originalText,
                hasFixedAttachments,
                previousDraft,
                previousAttachments,
              },
            },
          };
        });
      },

      cancelEdit: (session) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const key = getSessionKey(resolvedSession);

        set((state) => {
          const editState = state.editStateBySession[key];
          if (!editState) {
            return state;
          }

          return {
            draftsBySession: {
              ...state.draftsBySession,
              [key]: editState.previousDraft,
            },
            attachmentsBySession: {
              ...state.attachmentsBySession,
              [key]: editState.previousAttachments,
            },
            isDirtyBySession: {
              ...state.isDirtyBySession,
              [key]: editState.previousDraft.length > 0 || editState.previousAttachments.length > 0,
            },
            editStateBySession: {
              ...state.editStateBySession,
              [key]: null,
            },
          };
        });
      },

      clearEditState: (session) => {
        const resolvedSession = resolveSessionRef(session, get().activeSession);
        if (!resolvedSession) {
          return;
        }

        const key = getSessionKey(resolvedSession);

        set((state) => ({
          editStateBySession: {
            ...state.editStateBySession,
            [key]: null,
          },
        }));
      },

      resetSessionComposer: (session) => {
        const key = getSessionKey(session);

        set((state) => ({
          draftsBySession: {
            ...state.draftsBySession,
            [key]: '',
          },
          attachmentsBySession: {
            ...state.attachmentsBySession,
            [key]: [],
          },
          isDirtyBySession: {
            ...state.isDirtyBySession,
            [key]: false,
          },
          editStateBySession: {
            ...state.editStateBySession,
            [key]: null,
          },
        }));
      },

      reset: () => {
        set(initialState);
      },
    }),
    {
      name: 'web-app-composer-store',
      version: 2,
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        draftsBySession: state.draftsBySession,
        isDirtyBySession: state.isDirtyBySession,
      }),
      migrate: (persistedState) => {
        const state =
          persistedState && typeof persistedState === 'object'
            ? (persistedState as Partial<typeof initialState>)
            : {};

        return {
          draftsBySession: state.draftsBySession ?? {},
          attachmentsBySession: {},
          isDirtyBySession: state.isDirtyBySession ?? {},
          activeSession: null,
          editStateBySession: {},
        };
      },
    }
  )
);

export type { ComposerEditState, ComposerSnapshot, SessionRef };
