import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  AssistantMessageEventStream,
  Conversation,
  VERSION,
  USE_LLMS_MODEL_IDS,
  WebBrowser,
  WebDebuggerSession,
  WebTab,
  buildUserMessage,
  connectWeb,
  createFileKeysAdapter,
  createFileSessionsAdapter,
  createManagedConversation,
  InMemorySessionsAdapter,
  streamLlm,
  withWebBrowser,
} from '../../src/index.js';

describe('@ank1015/llm-agents', () => {
  it('exports package version', () => {
    const packageJson = JSON.parse(
      readFileSync(join(import.meta.dirname, '../../package.json'), 'utf8')
    ) as { version: string };

    expect(VERSION).toBe(packageJson.version);
  });

  it('exports the web helper surface from the package root', () => {
    expect(typeof connectWeb).toBe('function');
    expect(typeof withWebBrowser).toBe('function');
    expect(typeof WebBrowser).toBe('function');
    expect(typeof WebTab).toBe('function');
    expect(typeof WebDebuggerSession).toBe('function');
  });

  it('exports the use-llms helper surface from the package root', () => {
    expect(typeof streamLlm).toBe('function');
    expect(typeof createManagedConversation).toBe('function');
    expect(typeof buildUserMessage).toBe('function');
    expect(typeof createFileKeysAdapter).toBe('function');
    expect(typeof createFileSessionsAdapter).toBe('function');
    expect(typeof Conversation).toBe('function');
    expect(typeof AssistantMessageEventStream).toBe('function');
    expect(typeof InMemorySessionsAdapter).toBe('function');
    expect(USE_LLMS_MODEL_IDS).toEqual(['gpt-5.4', 'gpt-5.4-mini']);
  });
});
