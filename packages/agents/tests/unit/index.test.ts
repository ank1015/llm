import { describe, expect, it } from 'vitest';

import {
  VERSION,
  WebBrowser,
  WebDebuggerSession,
  WebTab,
  connectWeb,
  withWebBrowser,
} from '../../src/index.js';

describe('@ank1015/llm-agents', () => {
  it('exports package version', () => {
    expect(VERSION).toBe('0.0.4');
  });

  it('exports the web helper surface from the package root', () => {
    expect(typeof connectWeb).toBe('function');
    expect(typeof withWebBrowser).toBe('function');
    expect(typeof WebBrowser).toBe('function');
    expect(typeof WebTab).toBe('function');
    expect(typeof WebDebuggerSession).toBe('function');
  });
});
