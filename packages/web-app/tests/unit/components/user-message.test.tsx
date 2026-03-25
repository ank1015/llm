import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { MessageNode, UserMessage } from '@ank1015/llm-types';
import type { ReactNode } from 'react';

import { UserMessageComponent } from '@/components/user-message';
import { useChatStore } from '@/stores/chat-store';
import { useComposerStore } from '@/stores/composer-store';


vi.mock('next/navigation', () => ({
  useParams: () => ({
    projectId: 'project-1',
    artifactId: 'artifact-1',
    threadId: 'session-1',
  }),
}));

vi.mock('@/components/markdown-renderer', () => ({
  ChatMarkdown: ({ children }: { children: ReactNode }) => <>{children}</>,
}));

function resetChatStore(): void {
  useChatStore.setState({
    activeSession: null,
    messagesBySession: {},
    messageTreesBySession: {},
    persistedLeafNodeIdBySession: {},
    visibleLeafNodeIdBySession: {},
    liveRunBySession: {},
    lastSeqBySession: {},
    streamingAssistantBySession: {},
    pendingPromptsBySession: {},
    agentEventsBySession: {},
    isLoadingMessagesBySession: {},
    isStreamingBySession: {},
    errorsBySession: {},
  });
}

function resetComposerStore(): void {
  useComposerStore.getState().reset();
  useComposerStore.persist.clearStorage();
  localStorage.clear();
}

function createUserNode(message: UserMessage): MessageNode {
  return {
    type: 'message',
    id: 'user-node',
    parentId: null,
    branch: 'main',
    timestamp: new Date(message.timestamp ?? 1000).toISOString(),
    message,
    api: 'openai',
    modelId: 'gpt-5.4',
    providerOptions: {},
  };
}

describe('UserMessageComponent', () => {
  beforeEach(() => {
    resetChatStore();
    resetComposerStore();
  });

  it('hides saved-path notes and renders persisted image/pdf attachments', () => {
    const message: UserMessage = {
      role: 'user',
      id: 'user-1',
      timestamp: 1000,
      content: [
        { type: 'text', content: 'Please inspect these attachments' },
        {
          type: 'text',
          content:
            'Attachment "report.pdf" was saved to "/tmp/report.pdf" and can be referenced later if needed.',
          metadata: {
            hiddenFromUI: true,
            kind: 'saved-attachment-path',
          },
        },
        {
          type: 'image',
          data: 'ZmFrZS1pbWFnZQ==',
          mimeType: 'image/png',
          metadata: {
            artifactRelativePath: '.max/user-artifacts/diagram.png',
            fileName: 'diagram.png',
            originalFileName: 'diagram.png',
            size: 128,
          },
        },
        {
          type: 'file',
          data: 'JVBERi0xLjQK',
          mimeType: 'application/pdf',
          filename: 'report.pdf',
          metadata: {
            artifactRelativePath: '.max/user-artifacts/report.pdf',
            originalFileName: 'report.pdf',
            size: 256,
          },
        },
      ],
    };

    render(<UserMessageComponent userNode={createUserNode(message)} branchState={null} />);

    expect(screen.getByText('Please inspect these attachments')).toBeInTheDocument();
    expect(screen.queryByText(/saved to "\/tmp\/report\.pdf"/)).not.toBeInTheDocument();

    const image = screen.getByAltText('diagram.png');
    expect(image).toBeInTheDocument();
    expect(
      image.compareDocumentPosition(screen.getByText('Please inspect these attachments'))
    ).toBe(Node.DOCUMENT_POSITION_FOLLOWING);

    const pdfLink = screen.getByRole('link', { name: /report\.pdf/i });
    expect(pdfLink).toHaveAttribute(
      'href',
      expect.stringContaining('path=.max%2Fuser-artifacts%2Freport.pdf')
    );
  });

  it('allows editing attachment-only user messages while preserving fixed attachments', () => {
    const message: UserMessage = {
      role: 'user',
      id: 'user-attachment-only',
      timestamp: 1000,
      content: [
        {
          type: 'text',
          content:
            'Attachment "report.pdf" was saved to "/tmp/report.pdf" and can be referenced later if needed.',
          metadata: {
            hiddenFromUI: true,
            kind: 'saved-attachment-path',
          },
        },
        {
          type: 'file',
          data: 'JVBERi0xLjQK',
          mimeType: 'application/pdf',
          filename: 'report.pdf',
          metadata: {
            artifactRelativePath: '.max/user-artifacts/report.pdf',
            originalFileName: 'report.pdf',
          },
        },
      ],
    };

    render(<UserMessageComponent userNode={createUserNode(message)} branchState={null} />);

    fireEvent.click(screen.getByLabelText('Edit message'));

    expect(useComposerStore.getState().editStateBySession['session-1']).toMatchObject({
      hasFixedAttachments: true,
      originalText: '',
      targetNodeId: 'user-node',
    });
  });
});
