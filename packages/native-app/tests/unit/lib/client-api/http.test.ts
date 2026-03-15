import { describe, expect, it, vi } from 'vitest';

type HttpModule = typeof import('@/lib/client-api/http');

type LoadHttpModuleOptions = {
  configuredBaseUrl?: string;
  legacyBaseUrl?: string;
  platform?: 'android' | 'ios' | 'web';
  scriptUrl?: string | null;
  expoHostUri?: string | null;
  expoLogUrl?: string | null;
};

async function loadHttpModule(options: LoadHttpModuleOptions = {}): Promise<HttpModule> {
  vi.resetModules();

  if (options.configuredBaseUrl !== undefined) {
    process.env.EXPO_PUBLIC_LLM_SERVER_BASE_URL = options.configuredBaseUrl;
  } else {
    delete process.env.EXPO_PUBLIC_LLM_SERVER_BASE_URL;
  }

  if (options.legacyBaseUrl !== undefined) {
    process.env.EXPO_PUBLIC_LLM_SERVER_URL = options.legacyBaseUrl;
  } else {
    delete process.env.EXPO_PUBLIC_LLM_SERVER_URL;
  }

  vi.doMock('expo/fetch', () => ({
    fetch: vi.fn(),
  }));

  vi.doMock('expo-constants', () => ({
    default: {
      expoConfig: {
        hostUri: options.expoHostUri ?? null,
      },
      expoGoConfig: {
        debuggerHost: null,
        logUrl: options.expoLogUrl ?? null,
      },
    },
  }));

  vi.doMock('react-native', () => ({
    NativeModules: {
      SourceCode: {
        getConstants: () => ({
          scriptURL: options.scriptUrl ?? null,
        }),
      },
    },
    Platform: {
      OS: options.platform ?? 'ios',
    },
  }));

  return import('@/lib/client-api/http');
}

describe('client-api/http', () => {
  it('prefers the canonical base-url env var and trims trailing slashes', async () => {
    const { resolveServerBaseUrl } = await loadHttpModule({
      configuredBaseUrl: ' https://api.example.com/// ',
    });

    expect(resolveServerBaseUrl()).toBe('https://api.example.com');
  });

  it('supports the legacy env var while the transition is in progress', async () => {
    const { resolveServerBaseUrl } = await loadHttpModule({
      legacyBaseUrl: 'http://legacy.example.com/',
    });

    expect(resolveServerBaseUrl()).toBe('http://legacy.example.com');
  });

  it('falls back to the android emulator host when the bundle URL is localhost', async () => {
    const { resolveServerBaseUrl } = await loadHttpModule({
      platform: 'android',
      scriptUrl: 'http://127.0.0.1:8081/index.bundle?platform=android',
    });

    expect(resolveServerBaseUrl()).toBe('http://10.0.2.2:8001');
  });

  it('surfaces server error messages from apiRequestJson', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ error: 'Nope' }), {
        headers: {
          'Content-Type': 'application/json',
        },
        status: 400,
      })
    );

    vi.doMock('expo/fetch', () => ({
      fetch: fetchMock,
    }));
    vi.doMock('expo-constants', () => ({
      default: {
        expoConfig: {
          hostUri: null,
        },
        expoGoConfig: null,
      },
    }));
    vi.doMock('react-native', () => ({
      NativeModules: {},
      Platform: {
        OS: 'ios',
      },
    }));

    const { apiRequestJson } = await import('@/lib/client-api/http');

    await expect(apiRequestJson('http://server.test/api/projects')).rejects.toThrow('Nope');
  });
});
