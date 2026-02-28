import { describe, expect, it, vi } from 'vitest';

import { createWindowReplTool } from '../../../../src/tools/browser/repl.js';

interface MockWindowLike {
  ready: Promise<void>;
  tabs?: () => Promise<Array<{ id: number; windowId?: number }>>;
  screenshot?: () => Promise<string>;
  id?: number;
}

class FakeWindow implements MockWindowLike {
  readonly ready = Promise.resolve();
  readonly id: number | undefined;

  constructor(windowId?: number) {
    this.id = windowId;
  }

  async tabs(): Promise<Array<{ id: number; windowId?: number }>> {
    return [{ id: 11, windowId: this.id }];
  }
}

describe('createWindowReplTool', () => {
  const tinyPngBase64 =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO7Zg9wAAAAASUVORK5CYII=';

  it('validates options.windowId', () => {
    expect(() => {
      createWindowReplTool({ windowId: 0 });
    }).toThrow('[INVALID_INPUT]');
  });

  it('executes expression mode with scoped windowId', async () => {
    const createWindow = vi.fn((windowId?: number): MockWindowLike => {
      return {
        ready: Promise.resolve(),
        id: windowId,
      };
    });

    const tool = createWindowReplTool({
      windowId: 7001,
      operations: {
        createWindow,
        WindowClass: FakeWindow,
      },
    });

    const result = await tool.execute('repl-expression', {
      code: 'windowId ?? null',
    });

    expect(createWindow).toHaveBeenCalledWith(7001);
    expect(result.details).toMatchObject({
      mode: 'expression',
      windowId: 7001,
      resultType: 'number',
      result: 7001,
      logs: [],
    });
  });

  it('falls back to block mode for statement snippets and returns value', async () => {
    const tool = createWindowReplTool({
      windowId: 7001,
      operations: {
        createWindow: (windowId?: number): MockWindowLike => ({
          ready: Promise.resolve(),
          async tabs() {
            return [{ id: 25, windowId }];
          },
        }),
        WindowClass: FakeWindow,
      },
    });

    const result = await tool.execute('repl-block', {
      code: `
const tabs = await window.tabs?.();
console.log('tabs', tabs?.length ?? 0);
return tabs?.[0]?.id ?? null;
`.trim(),
    });

    expect(result.details).toMatchObject({
      mode: 'block',
      windowId: 7001,
      resultType: 'number',
      result: 25,
    });
    expect(result.details.logs[0]).toContain('tabs 1');
    expect(result.content[0]?.content).toContain('Execution mode: block');
  });

  it('allows per-call windowId override', async () => {
    const createWindow = vi.fn(
      (windowId?: number): MockWindowLike => ({
        ready: Promise.resolve(),
        id: windowId,
      })
    );

    const tool = createWindowReplTool({
      windowId: 7001,
      operations: {
        createWindow,
        WindowClass: FakeWindow,
      },
    });

    const result = await tool.execute('repl-override', {
      windowId: 8002,
      code: 'id',
    });

    expect(createWindow).toHaveBeenCalledWith(8002);
    expect(result.details).toMatchObject({
      mode: 'expression',
      windowId: 8002,
      result: 8002,
    });
  });

  it('exposes Window class in the environment', async () => {
    const tool = createWindowReplTool({
      operations: {
        WindowClass: FakeWindow,
      },
    });

    const result = await tool.execute('repl-window-class', {
      code: 'new Window(9100).id',
    });

    expect(result.details).toMatchObject({
      mode: 'expression',
      result: 9100,
    });
  });

  it('throws invalid-input when TypeScript cannot be parsed', async () => {
    const tool = createWindowReplTool({
      operations: {
        WindowClass: FakeWindow,
      },
    });

    await expect(
      tool.execute('repl-invalid-ts', {
        code: 'const value: = 1',
      })
    ).rejects.toThrow('[INVALID_INPUT]');
  });

  it('attaches image content when result is screenshot base64', async () => {
    const tool = createWindowReplTool({
      operations: {
        WindowClass: FakeWindow,
        createWindow: (): MockWindowLike => ({
          ready: Promise.resolve(),
          async screenshot() {
            return tinyPngBase64;
          },
        }),
      },
    });

    const result = await tool.execute('repl-screenshot', {
      code: 'await window.screenshot?.()',
    });

    expect(result.content[0]).toMatchObject({
      type: 'text',
    });
    expect(result.content[0]?.content).toContain('Image attached');
    expect(result.content[0]?.content).not.toContain(tinyPngBase64);
    expect(result.content[1]).toMatchObject({
      type: 'image',
      data: tinyPngBase64,
      mimeType: 'image/png',
    });
    expect(result.details).toMatchObject({
      resultType: 'image',
      result: 'Image attached',
      image: {
        mimeType: 'image/png',
      },
    });
  });
});
