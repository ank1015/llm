import { afterEach, vi } from 'vitest';

const ENV_KEYS = ['EXPO_PUBLIC_LLM_SERVER_BASE_URL', 'EXPO_PUBLIC_LLM_SERVER_URL'] as const;

afterEach(() => {
  for (const key of ENV_KEYS) {
    delete process.env[key];
  }

  vi.restoreAllMocks();
  vi.resetModules();
  vi.unstubAllGlobals();
});
