import { PassThrough } from 'node:stream';

import { afterEach, describe, it, expect } from 'vitest';

import { ChromeServer } from '../../../src/native/server.js';
import { LENGTH_PREFIX_BYTES } from '../../../src/protocol/constants.js';
import { ChromeClient } from '../../../src/sdk/client.js';
import { connect } from '../../../src/sdk/connect.js';

import type { ChromeMessage, HostMessage } from '../../../src/protocol/types.js';

/** Encode an object as a length-prefixed buffer. */
function encode(obj: unknown): Buffer {
  const json = Buffer.from(JSON.stringify(obj), 'utf-8');
  const length = Buffer.alloc(LENGTH_PREFIX_BYTES);
  length.writeUInt32LE(json.length, 0);
  return Buffer.concat([length, json]);
}

/**
 * Create a mock "Chrome" environment:
 * - A ChromeClient whose stdin/stdout are PassThrough streams we control
 * - A ChromeServer wrapping that client on a random port
 *
 * We simulate Chrome by reading HostMessages from `toChrome` and
 * writing ChromeMessages into `fromChrome`.
 */
function createMockChrome() {
  const toChrome = new PassThrough(); // what the client writes (host → chrome)
  const fromChrome = new PassThrough(); // what the client reads (chrome → host)

  const chromeClient = new ChromeClient({ input: fromChrome, output: toChrome });
  chromeClient.run().catch(() => {});

  return { chromeClient, toChrome, fromChrome };
}

function pushMessage(stream: PassThrough, message: ChromeMessage): void {
  stream.write(encode(message));
}

// Track servers for cleanup
const servers: ChromeServer[] = [];

afterEach(() => {
  for (const s of servers) s.close();
  servers.length = 0;
});

async function startServer(
  chromeClient: ChromeClient
): Promise<{ server: ChromeServer; port: number }> {
  const server = new ChromeServer(chromeClient, { port: 0, host: '127.0.0.1' });
  servers.push(server);

  // Wait for server to be listening
  await new Promise<void>((resolve) => {
    const check = (): void => {
      const addr = server.address;
      if (addr) resolve();
      else setTimeout(check, 5);
    };
    check();
  });

  const addr = server.address!;
  return { server, port: addr.port };
}

// ── call() through TCP ──────────────────────────────────────────────

describe('ChromeServer call proxying', () => {
  it('should proxy a call through to ChromeClient and return the result', async () => {
    const { chromeClient, toChrome, fromChrome } = createMockChrome();
    const { port } = await startServer(chromeClient);

    // Simulate Chrome responding to any call with a fixed result
    const readLoop = (async () => {
      const { readMessage } = await import('../../../src/native/stdio.js');
      while (true) {
        const msg = await readMessage<HostMessage>(toChrome);
        if (!msg) break;
        if (msg.type === 'call') {
          pushMessage(fromChrome, { id: msg.id, type: 'result', data: { tabs: [1, 2, 3] } });
        }
      }
    })();

    // Connect as an external agent
    const agent = await connect({ port });
    const result = await agent.call('tabs.query', {});
    expect(result).toEqual({ tabs: [1, 2, 3] });

    fromChrome.end();
    toChrome.end();
    await readLoop.catch(() => {});
  });

  it('should proxy errors back to the TCP client', async () => {
    const { chromeClient, toChrome, fromChrome } = createMockChrome();
    const { port } = await startServer(chromeClient);

    const readLoop = (async () => {
      const { readMessage } = await import('../../../src/native/stdio.js');
      while (true) {
        const msg = await readMessage<HostMessage>(toChrome);
        if (!msg) break;
        if (msg.type === 'call') {
          pushMessage(fromChrome, { id: msg.id, type: 'error', error: 'No such method' });
        }
      }
    })();

    const agent = await connect({ port });
    await expect(agent.call('fake.method')).rejects.toThrow('No such method');

    fromChrome.end();
    toChrome.end();
    await readLoop.catch(() => {});
  });
});

// ── subscribe() through TCP ─────────────────────────────────────────

describe('ChromeServer subscribe proxying', () => {
  it('should forward events from Chrome to the TCP client', async () => {
    const { chromeClient, toChrome, fromChrome } = createMockChrome();
    const { port } = await startServer(chromeClient);

    // Simulate Chrome: on subscribe, push two events
    const readLoop = (async () => {
      const { readMessage } = await import('../../../src/native/stdio.js');
      while (true) {
        const msg = await readMessage<HostMessage>(toChrome);
        if (!msg) break;
        if (msg.type === 'subscribe') {
          pushMessage(fromChrome, { id: msg.id, type: 'event', data: [1, { status: 'loading' }] });
          pushMessage(fromChrome, { id: msg.id, type: 'event', data: [1, { status: 'complete' }] });
        }
      }
    })();

    const agent = await connect({ port });
    const events: unknown[] = [];
    agent.subscribe('tabs.onUpdated', (data) => events.push(data));

    await new Promise((r) => setTimeout(r, 50));

    expect(events).toHaveLength(2);
    expect(events[0]).toEqual([1, { status: 'loading' }]);
    expect(events[1]).toEqual([1, { status: 'complete' }]);

    fromChrome.end();
    toChrome.end();
    await readLoop.catch(() => {});
  });
});

// ── multiple clients ────────────────────────────────────────────────

describe('ChromeServer multiple clients', () => {
  it('should handle two agents simultaneously', async () => {
    const { chromeClient, toChrome, fromChrome } = createMockChrome();
    const { port } = await startServer(chromeClient);

    let callCount = 0;
    const readLoop = (async () => {
      const { readMessage } = await import('../../../src/native/stdio.js');
      while (true) {
        const msg = await readMessage<HostMessage>(toChrome);
        if (!msg) break;
        if (msg.type === 'call') {
          callCount++;
          pushMessage(fromChrome, { id: msg.id, type: 'result', data: { call: callCount } });
        }
      }
    })();

    const agent1 = await connect({ port });
    const agent2 = await connect({ port });

    const [r1, r2] = await Promise.all([
      agent1.call('tabs.query', {}),
      agent2.call('tabs.query', {}),
    ]);

    // Both calls should have gotten results (order may vary)
    expect(r1).toHaveProperty('call');
    expect(r2).toHaveProperty('call');
    expect(callCount).toBe(2);

    fromChrome.end();
    toChrome.end();
    await readLoop.catch(() => {});
  });
});
