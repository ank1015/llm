import { afterEach, describe, expect, it, vi } from 'vitest';

describe('client-api barrel', () => {
  afterEach(() => {
    vi.resetModules();
  });

  it('exports the current skill endpoints and omits removed bundled-skill helpers', async () => {
    const clientApi = await import('@/lib/client-api');

    expect('installArtifactSkill' in clientApi).toBe(true);
    expect('listBundledSkills' in clientApi).toBe(false);
    expect('listInstalledArtifactSkills' in clientApi).toBe(true);
    expect('listRegisteredSkills' in clientApi).toBe(true);
  });
});
