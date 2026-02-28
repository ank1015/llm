import { randomUUID } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
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

export interface ObserveSnapshotPointer {
  version: number;
  snapshotId: string;
  createdAt: string;
  windowId: number;
  tabId: number;
  snapshotPath: string;
}

export interface ObserveSnapshotRecord {
  version: number;
  snapshotId: string;
  createdAt: string;
  windowId: number;
  tabId: number;
  options: NormalizedObserveOptions;
  snapshot: ObserveSnapshot;
}

export function getObserveTabDir(windowId: number, tabId: number): string {
  return join(tmpdir(), 'ank1015-llm', 'window-observe', `window-${windowId}`, `tab-${tabId}`);
}

export function getObserveLatestPath(windowId: number, tabId: number): string {
  return join(getObserveTabDir(windowId, tabId), 'latest.json');
}

export async function persistObserveSnapshot(
  input: PersistObserveSnapshotInput
): Promise<PersistObserveSnapshotResult> {
  const dir = getObserveTabDir(input.windowId, input.tabId);
  await mkdir(dir, { recursive: true });

  const snapshotId = `obs_${Date.now().toString(36)}_${randomUUID().slice(0, 8)}`;
  const snapshotPath = join(dir, `snapshot-${snapshotId}.json`);
  const latestPath = join(dir, 'latest.json');

  const record: ObserveSnapshotRecord = {
    version: 1,
    snapshotId,
    createdAt: new Date().toISOString(),
    windowId: input.windowId,
    tabId: input.tabId,
    options: input.options,
    snapshot: input.snapshot,
  };

  await writeFile(snapshotPath, JSON.stringify(record, null, 2), 'utf-8');
  const pointer: ObserveSnapshotPointer = {
    version: 1,
    snapshotId,
    createdAt: record.createdAt,
    windowId: input.windowId,
    tabId: input.tabId,
    snapshotPath,
  };
  await writeFile(latestPath, JSON.stringify(pointer, null, 2), 'utf-8');

  return {
    snapshotId,
    snapshotPath,
    latestPath,
  };
}

async function readJsonFile<T>(path: string): Promise<T | null> {
  try {
    const raw = await readFile(path, 'utf-8');
    return JSON.parse(raw) as T;
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isSnapshotRecord(value: unknown): value is ObserveSnapshotRecord {
  return (
    isObject(value) &&
    typeof value.snapshotId === 'string' &&
    typeof value.windowId === 'number' &&
    typeof value.tabId === 'number' &&
    isObject(value.snapshot)
  );
}

/**
 * Reads the latest observe snapshot record for a window+tab.
 * Returns null when no snapshot exists yet.
 */
export async function readLatestObserveSnapshot(
  windowId: number,
  tabId: number
): Promise<ObserveSnapshotRecord | null> {
  const latestPath = getObserveLatestPath(windowId, tabId);
  const pointer = await readJsonFile<ObserveSnapshotPointer>(latestPath);

  if (!pointer || typeof pointer.snapshotPath !== 'string') {
    return null;
  }

  const record = await readJsonFile<unknown>(pointer.snapshotPath);
  if (!isSnapshotRecord(record)) {
    return null;
  }

  if (record.windowId !== windowId || record.tabId !== tabId) {
    return null;
  }

  return record;
}
