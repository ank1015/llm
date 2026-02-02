'use client';

import { create } from 'zustand';

import type { Attachment } from '@ank1015/llm-sdk';

type SessionScope = {
  projectName?: string;
  path?: string;
};

type SessionRef = SessionScope & {
  sessionId: string;
};

type ComposerSnapshot = {
  draft: string;
  attachments: Attachment[];
  isDirty: boolean;
};

type ComposerStoreState = {
  activeSession: SessionRef | null;
  draftsBySession: Record<string, string>;
  attachmentsBySession: Record<string, Attachment[]>;
  isDirtyBySession: Record<string, boolean>;
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
  resetSessionComposer: (session: SessionRef) => void;
  reset: () => void;
};

const initialState = {
  activeSession: null as SessionRef | null,
  draftsBySession: {} as Record<string, string>,
  attachmentsBySession: {} as Record<string, Attachment[]>,
  isDirtyBySession: {} as Record<string, boolean>,
};

function normalizeText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
}

function normalizeSessionRef(session: SessionRef): SessionRef {
  return {
    sessionId: session.sessionId,
    projectName: normalizeText(session.projectName),
    path: normalizeText(session.path),
  };
}

function getSessionKey(session: SessionRef): string {
  const normalized = normalizeSessionRef(session);
  return `${normalized.projectName ?? ''}::${normalized.path ?? ''}::${normalized.sessionId}`;
}

function resolveSessionRef(
  session: SessionRef | undefined,
  activeSession: SessionRef | null
): SessionRef | undefined {
  if (session) {
    return normalizeSessionRef(session);
  }

  if (activeSession) {
    return normalizeSessionRef(activeSession);
  }

  return undefined;
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

export const useComposerStore = create<ComposerStoreState>((set, get) => ({
  ...initialState,

  setActiveSession: (session) => {
    if (!session) {
      set({ activeSession: null });
      return;
    }

    const normalized = normalizeSessionRef(session);
    const key = getSessionKey(normalized);

    set((state) => ({
      activeSession: normalized,
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

  resetSessionComposer: (session) => {
    const normalized = normalizeSessionRef(session);
    const key = getSessionKey(normalized);

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

  reset: () => {
    set(initialState);
  },
}));

export type { ComposerSnapshot, SessionRef };
