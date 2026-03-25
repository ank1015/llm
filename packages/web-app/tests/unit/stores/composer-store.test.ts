import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { Attachment } from '@ank1015/llm-types';

import { useComposerStore } from '@/stores/composer-store';


const SESSION = { sessionId: 'session-1' };

const PDF_ATTACHMENT: Attachment = {
  id: 'file-1',
  type: 'file',
  fileName: 'report.pdf',
  mimeType: 'application/pdf',
  size: 42,
  content: 'JVBERi0xLjQK',
};

function resetComposerStore(): void {
  useComposerStore.getState().reset();
  useComposerStore.persist.clearStorage();
  localStorage.clear();
}

describe('composer store', () => {
  beforeEach(() => {
    resetComposerStore();
  });

  afterEach(() => {
    resetComposerStore();
  });

  it('does not persist attachment payloads to localStorage', async () => {
    useComposerStore.getState().setActiveSession(SESSION);
    useComposerStore.getState().setDraft({
      session: SESSION,
      draft: 'Review the attached pdf',
    });
    useComposerStore.getState().addAttachment({
      session: SESSION,
      attachment: PDF_ATTACHMENT,
    });

    const rawPersistedState = localStorage.getItem('web-app-composer-store');
    expect(rawPersistedState).toContain('Review the attached pdf');
    expect(rawPersistedState).not.toContain('report.pdf');
    expect(rawPersistedState).not.toContain('JVBERi0xLjQK');

    expect(rawPersistedState).toContain('"draftsBySession"');
    expect(rawPersistedState).toContain('"Review the attached pdf"');
    expect(rawPersistedState).not.toContain('"attachmentsBySession"');
  });

  it('restores previous attachments when edit mode is cancelled', () => {
    useComposerStore.getState().setActiveSession(SESSION);
    useComposerStore.getState().setDraft({
      session: SESSION,
      draft: 'Pending follow-up',
    });
    useComposerStore.getState().addAttachment({
      session: SESSION,
      attachment: PDF_ATTACHMENT,
    });

    useComposerStore.getState().beginEdit({
      session: SESSION,
      targetNodeId: 'node-1',
      originalText: '',
      hasFixedAttachments: true,
    });

    expect(useComposerStore.getState().editStateBySession[SESSION.sessionId]).toMatchObject({
      hasFixedAttachments: true,
      targetNodeId: 'node-1',
    });
    expect(useComposerStore.getState().getSnapshot(SESSION).attachments).toEqual([]);

    useComposerStore.getState().cancelEdit(SESSION);

    const snapshot = useComposerStore.getState().getSnapshot(SESSION);
    expect(snapshot.draft).toBe('Pending follow-up');
    expect(snapshot.attachments).toEqual([PDF_ATTACHMENT]);
  });
});
