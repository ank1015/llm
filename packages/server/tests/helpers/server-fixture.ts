import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { resetTerminalRegistry } from '../../src/core/terminal/terminal-registry.js';
import { setConfig } from '../../src/core/config.js';

type JsonRoute = {
  request: (input: string, init?: RequestInit) => Promise<Response>;
};

export async function createTempServerConfig(
  prefix = 'llm-server-test'
): Promise<{
  projectsRoot: string;
  dataRoot: string;
  cleanup: () => Promise<void>;
}> {
  const projectsRoot = await mkdtemp(join(tmpdir(), `${prefix}-projects-`));
  const dataRoot = await mkdtemp(join(tmpdir(), `${prefix}-data-`));

  setConfig({ projectsRoot, dataRoot });

  return {
    projectsRoot,
    dataRoot,
    cleanup: async () => {
      resetTerminalRegistry();
      await rm(projectsRoot, { recursive: true, force: true });
      await rm(dataRoot, { recursive: true, force: true });
    },
  };
}

export function jsonRequest(
  route: JsonRoute,
  path: string,
  method: string,
  body?: unknown
): Promise<Response> {
  return route.request(path, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
}

export type ParsedSseEvent = {
  id?: number;
  event: string;
  data: unknown;
};

export async function readSseEvents(response: Response): Promise<ParsedSseEvent[]> {
  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error('Expected streaming response body');
  }

  const decoder = new TextDecoder();
  let payload = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    payload += decoder.decode(value, { stream: true });
  }

  payload += decoder.decode();

  return payload
    .split('\n\n')
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0 && !chunk.startsWith(':'))
    .map((chunk) => {
      const parsed: {
        id?: number;
        event?: string;
        data?: string;
      } = {};

      for (const line of chunk.split('\n')) {
        if (line.startsWith('id: ')) {
          parsed.id = Number(line.slice(4));
          continue;
        }

        if (line.startsWith('event: ')) {
          parsed.event = line.slice(7);
          continue;
        }

        if (line.startsWith('data: ')) {
          parsed.data = line.slice(6);
        }
      }

      if (!parsed.event || parsed.data === undefined) {
        throw new Error(`Malformed SSE payload chunk: ${chunk}`);
      }

      return {
        ...(Number.isFinite(parsed.id) ? { id: parsed.id } : {}),
        event: parsed.event,
        data: JSON.parse(parsed.data) as unknown,
      };
    });
}
