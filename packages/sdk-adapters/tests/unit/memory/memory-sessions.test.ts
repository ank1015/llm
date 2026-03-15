import { describe, expect, it } from 'vitest';

import { InMemorySessionsAdapter } from '../../../src/memory/memory-sessions.js';

import type { UserMessage } from '@ank1015/llm-types';

function createUserMessage(content: string): UserMessage {
  return {
    role: 'user',
    id: `user-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    timestamp: Date.now(),
    content: [{ type: 'text', content }],
  };
}

describe('InMemorySessionsAdapter', () => {
  it('creates and lists sessions', async () => {
    const adapter = new InMemorySessionsAdapter();

    const { sessionId } = await adapter.createSession({
      projectName: 'demo',
      sessionName: 'First Session',
    });

    const session = await adapter.getSession({
      projectName: 'demo',
      path: '',
      sessionId,
    });
    const sessions = await adapter.listSessions('demo');

    expect(session?.header.sessionName).toBe('First Session');
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.sessionId).toBe(sessionId);
  });

  it('appends message and custom nodes and reads them back', async () => {
    const adapter = new InMemorySessionsAdapter();
    const { sessionId, header } = await adapter.createSession({
      projectName: 'demo',
    });

    const { node: messageNode } = await adapter.appendMessage({
      projectName: 'demo',
      path: '',
      sessionId,
      parentId: header.id,
      branch: 'main',
      message: createUserMessage('hello'),
      api: 'anthropic',
      modelId: 'claude-haiku-4-5',
      providerOptions: {},
    });

    const customNode = await adapter.appendCustom({
      projectName: 'demo',
      path: '',
      sessionId,
      parentId: messageNode.id,
      branch: 'main',
      payload: { note: 'saved' },
    });

    const latestNode = await adapter.getLatestNode(
      {
        projectName: 'demo',
        path: '',
        sessionId,
      },
      'main'
    );
    const messages = await adapter.getMessages({
      projectName: 'demo',
      path: '',
      sessionId,
    });

    expect(customNode?.type).toBe('custom');
    expect(latestNode?.id).toBe(customNode?.id);
    expect(messages).toHaveLength(1);
    expect(messages?.[0]?.id).toBe(messageNode.id);
  });

  it('tracks branches and can search by session name', async () => {
    const adapter = new InMemorySessionsAdapter();
    const { sessionId, header } = await adapter.createSession({
      projectName: 'demo',
      sessionName: 'Research Thread',
    });

    const { node: rootMessage } = await adapter.appendMessage({
      projectName: 'demo',
      path: '',
      sessionId,
      parentId: header.id,
      branch: 'main',
      message: createUserMessage('main'),
      api: 'anthropic',
      modelId: 'claude-haiku-4-5',
      providerOptions: {},
    });

    const { node: experimentNode } = await adapter.appendMessage({
      projectName: 'demo',
      path: '',
      sessionId,
      parentId: rootMessage.id,
      branch: 'experiment',
      message: createUserMessage('branch'),
      api: 'anthropic',
      modelId: 'claude-haiku-4-5',
      providerOptions: {},
    });

    const branches = await adapter.getBranches({
      projectName: 'demo',
      path: '',
      sessionId,
    });
    const latestExperimentNode = await adapter.getLatestNode(
      {
        projectName: 'demo',
        path: '',
        sessionId,
      },
      'experiment'
    );
    const searchResults = await adapter.searchSessions('demo', 'research');

    expect(branches?.map((branch) => branch.name)).toEqual(['main', 'experiment']);
    expect(latestExperimentNode?.id).toBe(experimentNode.id);
    expect(searchResults).toHaveLength(1);
    expect(searchResults[0]?.sessionName).toBe('Research Thread');
  });
});
