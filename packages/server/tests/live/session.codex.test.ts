import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createApp } from '../../src/app.js';
import { Session } from '../../src/core/session/session.js';
import { readSseEvents } from '../helpers/server-fixture.js';
import { requireCodexLiveCredentials } from '../helpers/live.js';
import { createTempServerConfig, jsonRequest } from '../helpers/server-fixture.js';

import type { Message } from '@ank1015/llm-sdk';
import type { SessionMessageNode } from '../../src/types/index.js';

const LIVE_MODEL_ID = 'codex/gpt-5.4-mini';

async function expectJsonStatus<T>(response: Response, status: number): Promise<T> {
  const text = await response.text();
  expect(response.status, text).toBe(status);
  return (text ? JSON.parse(text) : null) as T;
}

async function expectStreamingStatus(response: Response, status: number): Promise<void> {
  if (response.status === status) {
    return;
  }

  const text = await response.text();
  expect(response.status, text).toBe(status);
}

function getAssistantText(message: Message): string {
  if (message.role !== 'assistant') {
    return '';
  }

  let text = '';
  for (const block of message.content) {
    if (block.type !== 'response') {
      continue;
    }

    for (const item of block.response) {
      if (item.type === 'text') {
        text += item.content;
      }
    }
  }

  return text.trim();
}

function getAssistantTexts(messages: Message[]): string[] {
  return messages
    .filter((message): message is Extract<Message, { role: 'assistant' }> => message.role === 'assistant')
    .map(getAssistantText)
    .filter((text) => text.length > 0);
}

function hasAssistantToolCall(
  messages: Message[],
  predicate: (toolCall: {
    name: string;
    arguments: Record<string, unknown>;
    toolCallId: string;
  }) => boolean
): boolean {
  return messages.some((message) => {
    if (message.role !== 'assistant') {
      return false;
    }

    return message.content.some((block) => {
      return (
        block.type === 'toolCall' &&
        predicate({
          name: block.name,
          arguments: block.arguments,
          toolCallId: block.toolCallId,
        })
      );
    });
  });
}

function getVisibleUserText(node: SessionMessageNode): string {
  if (node.message.role !== 'user') {
    return '';
  }

  return node.message.content
    .filter((block) => block.type === 'text' && !block.metadata?.hiddenFromUI)
    .map((block) => block.content)
    .join('\n')
    .trim();
}

function getEventNames(events: Array<{ event: string }>): string[] {
  return events.map((event) => event.event);
}

let cleanup: (() => Promise<void>) | null = null;
let app = createApp();

beforeAll(async () => {
  await requireCodexLiveCredentials();
}, 10_000);

beforeEach(async () => {
  const fixture = await createTempServerConfig('llm-server-live-codex');
  cleanup = fixture.cleanup;
  app = createApp();

  await jsonRequest(app, '/api/projects', 'POST', { name: 'Live Project' });
  await jsonRequest(app, '/api/projects/live-project/artifacts', 'POST', { name: 'Research' });
});

afterEach(async () => {
  await cleanup?.();
  cleanup = null;
});

describe('live Codex session routes', () => {
  it('creates a session, prompts it, and generates a name through the live session API', async () => {
    const createResponse = await jsonRequest(
      app,
      '/api/projects/live-project/artifacts/research/sessions',
      'POST',
      {
        name: 'Live Session',
        modelId: LIVE_MODEL_ID,
      }
    );
    const created = await expectJsonStatus<{ id: string; name: string }>(createResponse, 201);
    expect(created.name).toBe('Live Session');

    const promptResponse = await jsonRequest(
      app,
      `/api/projects/live-project/artifacts/research/sessions/${created.id}/prompt`,
      'POST',
      {
        message: 'Reply with exactly SERVER_LIVE_PROMPT_OK',
        reasoningEffort: 'low',
      }
    );
    const promptedMessages = await expectJsonStatus<Message[]>(promptResponse, 200);
    expect(promptedMessages).toHaveLength(2);
    expect(getAssistantText(promptedMessages[1]!)).toContain('SERVER_LIVE_PROMPT_OK');

    const messagesResponse = await app.request(
      `/api/projects/live-project/artifacts/research/sessions/${created.id}/messages`
    );
    expect(messagesResponse.status).toBe(200);
    const nodes = (await messagesResponse.json()) as SessionMessageNode[];
    expect(nodes).toHaveLength(2);
    expect(nodes[0]?.metadata?.modelId).toBe(LIVE_MODEL_ID);
    expect(nodes[1]?.metadata?.modelId).toBe(LIVE_MODEL_ID);

    const nameResponse = await jsonRequest(
      app,
      `/api/projects/live-project/artifacts/research/sessions/${created.id}/generate-name`,
      'POST',
      {
        query: 'Server live Codex session route verification',
      }
    );
    const named = await expectJsonStatus<{ sessionName: string }>(nameResponse, 200);
    expect(named.sessionName.trim().length).toBeGreaterThan(0);

    const metadataResponse = await app.request(
      `/api/projects/live-project/artifacts/research/sessions/${created.id}`
    );
    expect(metadataResponse.status).toBe(200);
    expect(await metadataResponse.json()).toMatchObject({
      id: created.id,
      name: named.sessionName,
      modelId: LIVE_MODEL_ID,
    });
  }, 120_000);

  it('streams a live turn and creates retry and edit branches through the session API', async () => {
    const session = await Session.create('live-project', 'research', {
      name: 'Streaming Live Session',
      modelId: LIVE_MODEL_ID,
    });

    const initialPromptResponse = await jsonRequest(
      app,
      `/api/projects/live-project/artifacts/research/sessions/${session.sessionId}/prompt`,
      'POST',
      {
        message: 'Reply with exactly SERVER_LIVE_BRANCH_BASE_OK',
        reasoningEffort: 'low',
      }
    );
    await expectJsonStatus<Message[]>(initialPromptResponse, 200);

    const initialTree = await session.getMessageTree();
    const originalUserNode = initialTree.nodes.find((node) => node.message.role === 'user');
    expect(originalUserNode).toBeDefined();

    const streamResponse = await jsonRequest(
      app,
      `/api/projects/live-project/artifacts/research/sessions/${session.sessionId}/stream`,
      'POST',
      {
        message: 'Reply with exactly SERVER_LIVE_STREAM_OK',
        reasoningEffort: 'low',
      }
    );
    await expectStreamingStatus(streamResponse, 200);

    const streamEvents = await readSseEvents(streamResponse);
    expect(streamEvents.map((event) => event.event)).toEqual(
      expect.arrayContaining(['ready', 'node_persisted', 'done'])
    );

    const streamedTree = await session.getMessageTree();
    const mainLeafNodeId = streamedTree.persistedLeafNodeId;
    expect(mainLeafNodeId).toBeTruthy();
    if (!mainLeafNodeId) {
      throw new Error('Expected a visible main-branch leaf node');
    }

    const retryResponse = await jsonRequest(
      app,
      `/api/projects/live-project/artifacts/research/sessions/${session.sessionId}/messages/${originalUserNode!.id}/retry/stream`,
      'POST',
      {
        reasoningEffort: 'low',
      }
    );
    await expectStreamingStatus(retryResponse, 200);
    const retryEvents = await readSseEvents(retryResponse);
    expect(getEventNames(retryEvents), JSON.stringify(retryEvents)).toContain('done');

    const editResponse = await jsonRequest(
      app,
      `/api/projects/live-project/artifacts/research/sessions/${session.sessionId}/messages/${originalUserNode!.id}/edit/stream`,
      'POST',
      {
        message: 'Reply with exactly SERVER_LIVE_EDIT_OK',
        leafNodeId: mainLeafNodeId,
        reasoningEffort: 'low',
      }
    );
    await expectStreamingStatus(editResponse, 200);
    const editEvents = await readSseEvents(editResponse);
    expect(getEventNames(editEvents), JSON.stringify(editEvents)).toContain('done');

    const treeResponse = await app.request(
      `/api/projects/live-project/artifacts/research/sessions/${session.sessionId}/tree`
    );
    expect(treeResponse.status).toBe(200);
    const tree = (await treeResponse.json()) as {
      nodes: SessionMessageNode[];
      activeBranch: string;
    };

    expect(tree.nodes.some((node) => node.branch.startsWith('retry-'))).toBe(true);
    expect(tree.nodes.some((node) => node.branch.startsWith('edit-'))).toBe(true);

    const editedUserNode = tree.nodes.find(
      (node) => node.branch.startsWith('edit-') && node.message.role === 'user'
    );
    expect(editedUserNode).toBeDefined();
    expect(getVisibleUserText(editedUserNode!)).toBe('Reply with exactly SERVER_LIVE_EDIT_OK');

    const assistantNodes = tree.nodes.filter((node) => node.message.role === 'assistant');
    const assistantTexts = assistantNodes.map((node) => getAssistantText(node.message));
    expect(assistantTexts.join('\n')).toContain('SERVER_LIVE_STREAM_OK');
    expect(assistantTexts.join('\n')).toContain('SERVER_LIVE_EDIT_OK');
  }, 240_000);

  it('accepts an attachment-backed live prompt and persists the uploaded file metadata', async () => {
    const session = await Session.create('live-project', 'research', {
      name: 'Attachment Live Session',
      modelId: LIVE_MODEL_ID,
    });

    const attachmentResponse = await jsonRequest(
      app,
      `/api/projects/live-project/artifacts/research/sessions/${session.sessionId}/prompt`,
      'POST',
      {
        message:
          'Read the attached file and reply with exactly SERVER_LIVE_ATTACHMENT_OK if you can see that token.',
        reasoningEffort: 'low',
        attachments: [
          {
            id: 'attachment-1',
            type: 'file',
            fileName: 'live-note.txt',
            mimeType: 'text/plain',
            content: Buffer.from('SERVER_LIVE_ATTACHMENT_OK', 'utf8').toString('base64'),
          },
        ],
      }
    );
    const promptedMessages = await expectJsonStatus<Message[]>(attachmentResponse, 200);
    const assistantTexts = getAssistantTexts(promptedMessages).join('\n');
    const referencedSavedAttachment = hasAssistantToolCall(promptedMessages, (toolCall) => {
      if (toolCall.name !== 'read') {
        return false;
      }

      const path = toolCall.arguments.path;
      return typeof path === 'string' && path.includes('.max/user-artifacts/live-note.txt');
    });
    expect(
      assistantTexts.includes('SERVER_LIVE_ATTACHMENT_OK') || referencedSavedAttachment,
      JSON.stringify(promptedMessages)
    ).toBe(true);

    const messages = await session.getHistoryNodes();
    const userNode = messages.find((node) => node.message.role === 'user');
    expect(userNode).toBeDefined();

    if (userNode?.message.role !== 'user') {
      throw new Error('Expected a user node');
    }

    expect(
      userNode.message.content.some(
        (block) => block.type === 'file' && block.metadata?.originalFileName === 'live-note.txt'
      )
    ).toBe(true);
    expect(
      userNode.message.content.some(
        (block) =>
          block.type === 'text' &&
          block.metadata?.hiddenFromUI === true &&
          block.content.includes('.max/user-artifacts')
      )
    ).toBe(true);
  }, 120_000);
});
