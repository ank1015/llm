import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import type { NormalizedObserveOptions, ObserveSnapshot } from './types.js';

interface PersistObserveSnapshotInput {
  windowId: number;
  tabId: number;
  snapshot: ObserveSnapshot;
  options: NormalizedObserveOptions;
}

export interface PersistObserveSnapshotResult {
  snapshotId: string;
  snapshotPath: string;
  latestPath: string;
}

export function getObserveTabDir(windowId: number, tabId: number): string {
  return join(tmpdir(), 'ank1015-llm', 'window-observe', `window-${windowId}`, `tab-${tabId}`);
}

export async function persistObserveSnapshot(
  input: PersistObserveSnapshotInput
): Promise<PersistObserveSnapshotResult> {
  const dir = getObserveTabDir(input.windowId, input.tabId);
  await mkdir(dir, { recursive: true });

  const snapshotId = `obs_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const snapshotPath = join(dir, `snapshot-${snapshotId}.json`);
  const latestPath = join(dir, 'latest.json');

  const record = {
    version: 1,
    snapshotId,
    createdAt: new Date().toISOString(),
    windowId: input.windowId,
    tabId: input.tabId,
    options: input.options,
    snapshot: input.snapshot,
  };

  await writeFile(snapshotPath, JSON.stringify(record, null, 2), 'utf-8');
  await writeFile(
    latestPath,
    JSON.stringify(
      {
        version: 1,
        snapshotId,
        createdAt: record.createdAt,
        windowId: input.windowId,
        tabId: input.tabId,
        snapshotPath,
      },
      null,
      2
    ),
    'utf-8'
  );

  return {
    snapshotId,
    snapshotPath,
    latestPath,
  };
}
