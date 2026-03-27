import { afterEach, describe, expect, it, vi } from 'vitest';

import { TerminalRegistry } from '../../../src/core/terminal/terminal-registry.js';
import { createFakePtyFactory } from '../../helpers/fake-pty.js';

import type { TerminalServerMessage } from '@ank1015/llm-app-contracts';

function createSubscriber() {
  const messages: TerminalServerMessage[] = [];
  const closes: Array<{ code?: number; reason?: string }> = [];

  return {
    messages,
    closes,
    subscriber: {
      send: (message: TerminalServerMessage) => {
        messages.push(message);
      },
      close: (code?: number, reason?: string) => {
        closes.push({ code, reason });
      },
    },
  };
}

afterEach(() => {
  vi.useRealTimers();
});

describe('TerminalRegistry', () => {
  it('creates terminals and forwards attach, input, and resize operations', () => {
    const { factory, instances } = createFakePtyFactory();
    const registry = new TerminalRegistry(factory);

    const terminal = registry.createTerminal({
      projectId: 'project-1',
      artifactId: 'artifact-1',
      cwd: '/tmp/project-1/artifact-1',
      options: {
        cols: 132,
        rows: 42,
      },
    });

    expect(terminal.title).toBe('Terminal 1');
    expect(terminal.status).toBe('running');
    expect(terminal.cols).toBe(132);
    expect(terminal.rows).toBe(42);
    expect(instances).toHaveLength(1);

    const sink = createSubscriber();
    const detach = registry.attachTerminal(
      terminal.projectId,
      terminal.artifactId,
      terminal.id,
      sink.subscriber,
      0
    );

    expect(detach).not.toBeNull();
    expect(sink.messages[0]).toMatchObject({
      type: 'ready',
      terminal: expect.objectContaining({
        id: terminal.id,
        title: 'Terminal 1',
      }),
    });

    instances[0]!.emitData('pwd\r\n');
    registry.writeInput(terminal.projectId, terminal.artifactId, terminal.id, 'ls\r');
    registry.resizeTerminal(terminal.projectId, terminal.artifactId, terminal.id, 160, 50);

    expect(instances[0]!.writes).toEqual(['ls\r']);
    expect(instances[0]!.resizeCalls).toEqual([{ cols: 160, rows: 50 }]);
    expect(sink.messages[1]).toEqual({
      type: 'output',
      seq: 1,
      data: 'pwd\r\n',
    });
    expect(registry.getTerminal(terminal.projectId, terminal.artifactId, terminal.id)).toEqual(
      expect.objectContaining({
        cols: 160,
        rows: 50,
      })
    );

    detach?.();
  });

  it('replays output and replaces the active controlling subscriber on reattach', () => {
    const { factory, instances } = createFakePtyFactory();
    const registry = new TerminalRegistry(factory);
    const terminal = registry.createTerminal({
      projectId: 'project-1',
      artifactId: 'artifact-1',
      cwd: '/tmp/project-1/artifact-1',
    });

    const first = createSubscriber();
    registry.attachTerminal(
      terminal.projectId,
      terminal.artifactId,
      terminal.id,
      first.subscriber,
      0
    );
    instances[0]!.emitData('first chunk');

    const second = createSubscriber();
    registry.attachTerminal(
      terminal.projectId,
      terminal.artifactId,
      terminal.id,
      second.subscriber,
      0
    );
    instances[0]!.emitData('second chunk');

    expect(first.closes).toEqual([
      {
        code: 4101,
        reason: 'Terminal reattached from another connection',
      },
    ]);
    expect(second.messages).toEqual([
      expect.objectContaining({ type: 'ready' }),
      {
        type: 'output',
        seq: 1,
        data: 'first chunk',
      },
      {
        type: 'output',
        seq: 2,
        data: 'second chunk',
      },
    ]);
  });

  it('keeps exited terminals around for replay and cleans them up after the retention window', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-27T00:00:00.000Z'));

    const { factory, instances } = createFakePtyFactory();
    const registry = new TerminalRegistry(factory);
    const terminal = registry.createTerminal({
      projectId: 'project-1',
      artifactId: 'artifact-1',
      cwd: '/tmp/project-1/artifact-1',
    });

    instances[0]!.emitData('hello');
    instances[0]!.emitExit({ exitCode: 0 });

    expect(registry.getTerminal(terminal.projectId, terminal.artifactId, terminal.id)).toEqual(
      expect.objectContaining({
        status: 'exited',
        exitCode: 0,
      })
    );

    const replay = createSubscriber();
    registry.attachTerminal(
      terminal.projectId,
      terminal.artifactId,
      terminal.id,
      replay.subscriber,
      0
    );
    await Promise.resolve();

    expect(replay.messages).toEqual([
      expect.objectContaining({ type: 'ready' }),
      {
        type: 'output',
        seq: 1,
        data: 'hello',
      },
      expect.objectContaining({
        type: 'exit',
        seq: 2,
        exitCode: 0,
      }),
    ]);
    expect(replay.closes).toEqual([
      {
        code: 1000,
        reason: 'Terminal exited',
      },
    ]);

    vi.advanceTimersByTime(30 * 60 * 1000 + 1);
    expect(registry.getTerminal(terminal.projectId, terminal.artifactId, terminal.id)).toBeNull();
  });

  it('auto-closes detached terminals after long idle periods', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-27T00:00:00.000Z'));

    const { factory, instances } = createFakePtyFactory();
    const registry = new TerminalRegistry(factory);
    const terminal = registry.createTerminal({
      projectId: 'project-1',
      artifactId: 'artifact-1',
      cwd: '/tmp/project-1/artifact-1',
    });

    vi.advanceTimersByTime(12 * 60 * 60 * 1000);

    expect(instances[0]!.killSignals).toEqual([
      process.platform === 'win32' ? undefined : 'SIGHUP',
    ]);

    instances[0]!.emitExit({ exitCode: 0 });
    expect(registry.getTerminal(terminal.projectId, terminal.artifactId, terminal.id)).toEqual(
      expect.objectContaining({
        status: 'exited',
      })
    );
  });

  it('starts empty after a fresh registry is created', () => {
    const { factory: firstFactory } = createFakePtyFactory();
    const firstRegistry = new TerminalRegistry(firstFactory);
    firstRegistry.createTerminal({
      projectId: 'project-1',
      artifactId: 'artifact-1',
      cwd: '/tmp/project-1/artifact-1',
    });

    const { factory: secondFactory } = createFakePtyFactory();
    const secondRegistry = new TerminalRegistry(secondFactory);

    expect(secondRegistry.listTerminals('project-1', 'artifact-1')).toEqual([]);
  });
});
