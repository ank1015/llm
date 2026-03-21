import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  waitForGoogleHumanVerificationIfNeeded,
  waitForHumanVerificationIfNeeded,
} from '../../src/helpers/web/scripts/shared/human-verification.js';

type MockHumanVerificationTab = {
  waitForLoad: ReturnType<typeof vi.fn>;
  waitForIdle: ReturnType<typeof vi.fn>;
  evaluate: ReturnType<typeof vi.fn>;
};

describe('human verification helper', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns immediately when no verification gate is present', async () => {
    const tab = createTab([{ blocked: false, ready: true }]);

    await expect(
      waitForHumanVerificationIfNeeded(tab, {
        blockedPredicate: 'false',
        readyPredicate: 'true',
        timeoutMs: 25,
        pollIntervalMs: 1,
      })
    ).resolves.toEqual({
      required: false,
      resolved: true,
    });

    expect(tab.waitForLoad).not.toHaveBeenCalled();
    expect(tab.waitForIdle).not.toHaveBeenCalled();
  });

  it('waits through verification and transient navigation errors until the page is ready', async () => {
    const stderrWrite = vi
      .spyOn(process.stderr, 'write')
      .mockImplementation((() => true) as typeof process.stderr.write);
    const tab = createTab([
      new Error('Inspected target navigated or closed'),
      { blocked: true, ready: false },
      { blocked: true, ready: false },
      { blocked: false, ready: true },
      { blocked: false, ready: true },
    ]);

    await expect(
      waitForGoogleHumanVerificationIfNeeded(tab, {
        readyPredicate: 'true',
        timeoutMs: 100,
        pollIntervalMs: 1,
        settleMs: 0,
      })
    ).resolves.toEqual({
      required: true,
      resolved: true,
    });

    expect(tab.waitForLoad).toHaveBeenCalled();
    expect(tab.waitForIdle).toHaveBeenCalledWith(0);
    expect(stderrWrite).toHaveBeenCalledTimes(1);
  });

  it('returns unresolved when verification is not completed before the timeout', async () => {
    vi.spyOn(process.stderr, 'write').mockImplementation(
      (() => true) as typeof process.stderr.write
    );
    const tab = createTab([
      { blocked: true, ready: false },
      { blocked: true, ready: false },
      { blocked: true, ready: false },
      { blocked: true, ready: false },
    ]);

    await expect(
      waitForHumanVerificationIfNeeded(tab, {
        blockedPredicate: 'true',
        readyPredicate: 'false',
        timeoutMs: 5,
        pollIntervalMs: 1,
      })
    ).resolves.toEqual({
      required: true,
      resolved: false,
    });
  });
});

function createTab(
  states: Array<{ blocked: boolean; ready: boolean } | Error>
): MockHumanVerificationTab {
  let index = 0;

  return {
    waitForLoad: vi.fn().mockResolvedValue(undefined),
    waitForIdle: vi.fn().mockResolvedValue(undefined),
    evaluate: vi.fn().mockImplementation(async () => {
      const entry = states[Math.min(index, states.length - 1)];
      index += 1;

      if (entry instanceof Error) {
        throw entry;
      }

      return entry;
    }),
  };
}
