import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  DEFAULT_KEYS_FILE_PATH,
  getSdkConfig,
  resetSdkConfig,
  setSdkConfig,
} from '../../src/config.js';
import { CuratedModelIds, isCuratedModelId } from '../../src/index.js';
import { setProviderCredentials } from '../../src/keys.js';
import { resolveModelInput } from '../../src/model-input.js';

const tempDirectories: string[] = [];

async function createTempKeysFile(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'llm-sdk-model-input-'));
  tempDirectories.push(directory);
  return join(directory, 'keys.env');
}

afterEach(async () => {
  resetSdkConfig();
  await Promise.all(
    tempDirectories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))
  );
});

describe('model input', () => {
  it('exposes curated model ids for the first supported providers', () => {
    expect(CuratedModelIds).toEqual([
      'openai/gpt-5.4',
      'openai/gpt-5.3-codex',
      'openai/gpt-5.4-pro',
      'openai/gpt-5.4-mini',
      'openai/gpt-5.4-nano',
      'codex/gpt-5.4',
      'codex/gpt-5.4-mini',
      'codex/gpt-5.3-codex',
      'codex/gpt-5.3-codex-spark',
      'anthropic/claude-opus-4-6',
      'anthropic/claude-sonnet-4-6',
      'claude-code/claude-opus-4-6',
      'claude-code/claude-sonnet-4-6',
      'google/gemini-3.1-pro-preview',
      'google/gemini-3-flash-preview',
      'google/gemini-3.1-flash-lite-preview',
    ]);
  });

  it('can detect curated model ids', () => {
    expect(isCuratedModelId('openai/gpt-5.4')).toBe(true);
    expect(isCuratedModelId('anthropic/claude-opus-4-6')).toBe(true);
    expect(isCuratedModelId('claude-code/claude-sonnet-4-6')).toBe(true);
    expect(isCuratedModelId('google/gemini-3.1-pro-preview')).toBe(true);
    expect(isCuratedModelId('google/gemini-2.5-flash')).toBe(false);
  });

  it('resolves openai model, credentials, and standardized reasoning', async () => {
    const keysFilePath = await createTempKeysFile();
    await setProviderCredentials(keysFilePath, 'openai', {
      apiKey: 'openai-key',
    });

    const result = await resolveModelInput({
      modelId: 'openai/gpt-5.4-mini',
      reasoningEffort: 'high',
      keysFilePath,
    });

    expect(result).toEqual({
      ok: true,
      api: 'openai',
      modelId: 'openai/gpt-5.4-mini',
      keysFilePath,
      model: expect.objectContaining({
        api: 'openai',
        id: 'gpt-5.4-mini',
      }),
      providerOptions: {
        apiKey: 'openai-key',
        reasoning: {
          effort: 'high',
          summary: 'auto',
        },
      },
      provider: {
        model: expect.objectContaining({
          api: 'openai',
          id: 'gpt-5.4-mini',
        }),
        providerOptions: {
          apiKey: 'openai-key',
          reasoning: {
            effort: 'high',
            summary: 'auto',
          },
        },
      },
    });
  });

  it('resolves codex model and merges multi-field credentials', async () => {
    const keysFilePath = await createTempKeysFile();
    await setProviderCredentials(keysFilePath, 'codex', {
      apiKey: 'codex-key',
      'chatgpt-account-id': 'account-123',
    });

    const result = await resolveModelInput({
      modelId: 'codex/gpt-5.4',
      reasoningEffort: 'medium',
      keysFilePath,
    });

    expect(result).toEqual({
      ok: true,
      api: 'codex',
      modelId: 'codex/gpt-5.4',
      keysFilePath,
      model: expect.objectContaining({
        api: 'codex',
        id: 'gpt-5.4',
      }),
      providerOptions: {
        apiKey: 'codex-key',
        'chatgpt-account-id': 'account-123',
        reasoning: {
          effort: 'medium',
          summary: 'auto',
        },
      },
      provider: {
        model: expect.objectContaining({
          api: 'codex',
          id: 'gpt-5.4',
        }),
        providerOptions: {
          apiKey: 'codex-key',
          'chatgpt-account-id': 'account-123',
          reasoning: {
            effort: 'medium',
            summary: 'auto',
          },
        },
      },
    });
  });

  it('lets overrideProviderSetting win over defaults', async () => {
    const keysFilePath = await createTempKeysFile();
    await setProviderCredentials(keysFilePath, 'openai', {
      apiKey: 'openai-key',
    });

    const result = await resolveModelInput({
      modelId: 'openai/gpt-5.4',
      reasoningEffort: 'low',
      keysFilePath,
      overrideProviderSetting: {
        reasoning: {
          summary: 'detailed',
        },
        max_output_tokens: 2048,
      },
    });

    expect(result).toEqual({
      ok: true,
      api: 'openai',
      modelId: 'openai/gpt-5.4',
      keysFilePath,
      model: expect.objectContaining({
        api: 'openai',
        id: 'gpt-5.4',
      }),
      providerOptions: {
        apiKey: 'openai-key',
        reasoning: {
          effort: 'low',
          summary: 'detailed',
        },
        max_output_tokens: 2048,
      },
      provider: {
        model: expect.objectContaining({
          api: 'openai',
          id: 'gpt-5.4',
        }),
        providerOptions: {
          apiKey: 'openai-key',
          reasoning: {
            effort: 'low',
            summary: 'detailed',
          },
          max_output_tokens: 2048,
        },
      },
    });
  });

  it('resolves anthropic models with adaptive thinking enabled by default', async () => {
    const keysFilePath = await createTempKeysFile();
    await setProviderCredentials(keysFilePath, 'anthropic', {
      apiKey: 'anthropic-key',
    });

    const result = await resolveModelInput({
      modelId: 'anthropic/claude-sonnet-4-6',
      keysFilePath,
    });

    expect(result).toEqual({
      ok: true,
      api: 'anthropic',
      modelId: 'anthropic/claude-sonnet-4-6',
      keysFilePath,
      model: expect.objectContaining({
        api: 'anthropic',
        id: 'claude-sonnet-4-6',
      }),
      providerOptions: {
        apiKey: 'anthropic-key',
        thinking: {
          type: 'adaptive',
        },
        cache_control: {
          type: 'ephemeral',
        },
      },
      provider: {
        model: expect.objectContaining({
          api: 'anthropic',
          id: 'claude-sonnet-4-6',
        }),
        providerOptions: {
          apiKey: 'anthropic-key',
          thinking: {
            type: 'adaptive',
          },
          cache_control: {
            type: 'ephemeral',
          },
        },
      },
    });
  });

  it('maps xhigh to max for anthropic opus 4.6', async () => {
    const keysFilePath = await createTempKeysFile();
    await setProviderCredentials(keysFilePath, 'anthropic', {
      apiKey: 'anthropic-key',
    });

    const result = await resolveModelInput({
      modelId: 'anthropic/claude-opus-4-6',
      reasoningEffort: 'xhigh',
      keysFilePath,
    });

    expect(result).toEqual({
      ok: true,
      api: 'anthropic',
      modelId: 'anthropic/claude-opus-4-6',
      keysFilePath,
      model: expect.objectContaining({
        api: 'anthropic',
        id: 'claude-opus-4-6',
      }),
      providerOptions: {
        apiKey: 'anthropic-key',
        thinking: {
          type: 'adaptive',
        },
        cache_control: {
          type: 'ephemeral',
        },
        output_config: {
          effort: 'max',
        },
      },
      provider: {
        model: expect.objectContaining({
          api: 'anthropic',
          id: 'claude-opus-4-6',
        }),
        providerOptions: {
          apiKey: 'anthropic-key',
          thinking: {
            type: 'adaptive',
          },
          cache_control: {
            type: 'ephemeral',
          },
          output_config: {
            effort: 'max',
          },
        },
      },
    });
  });

  it('maps xhigh down to high for anthropic sonnet 4.6 so the request stays valid', async () => {
    const keysFilePath = await createTempKeysFile();
    await setProviderCredentials(keysFilePath, 'anthropic', {
      apiKey: 'anthropic-key',
    });

    const result = await resolveModelInput({
      modelId: 'anthropic/claude-sonnet-4-6',
      reasoningEffort: 'xhigh',
      keysFilePath,
    });

    expect(result).toEqual({
      ok: true,
      api: 'anthropic',
      modelId: 'anthropic/claude-sonnet-4-6',
      keysFilePath,
      model: expect.objectContaining({
        api: 'anthropic',
        id: 'claude-sonnet-4-6',
      }),
      providerOptions: {
        apiKey: 'anthropic-key',
        thinking: {
          type: 'adaptive',
        },
        cache_control: {
          type: 'ephemeral',
        },
        output_config: {
          effort: 'high',
        },
      },
      provider: {
        model: expect.objectContaining({
          api: 'anthropic',
          id: 'claude-sonnet-4-6',
        }),
        providerOptions: {
          apiKey: 'anthropic-key',
          thinking: {
            type: 'adaptive',
          },
          cache_control: {
            type: 'ephemeral',
          },
          output_config: {
            effort: 'high',
          },
        },
      },
    });
  });

  it('resolves claude-code models with adaptive thinking and credential fields', async () => {
    const keysFilePath = await createTempKeysFile();
    await setProviderCredentials(keysFilePath, 'claude-code', {
      oauthToken: 'oauth-token',
      betaFlag: 'oauth-2025-04-20',
      billingHeader: 'x-billing-account: acc-123',
    });

    const result = await resolveModelInput({
      modelId: 'claude-code/claude-sonnet-4-6',
      reasoningEffort: 'medium',
      keysFilePath,
    });

    expect(result).toEqual({
      ok: true,
      api: 'claude-code',
      modelId: 'claude-code/claude-sonnet-4-6',
      keysFilePath,
      model: expect.objectContaining({
        api: 'claude-code',
        id: 'claude-sonnet-4-6',
      }),
      providerOptions: {
        oauthToken: 'oauth-token',
        betaFlag: 'oauth-2025-04-20',
        billingHeader: 'x-billing-account: acc-123',
        thinking: {
          type: 'adaptive',
        },
        cache_control: {
          type: 'ephemeral',
        },
        output_config: {
          effort: 'medium',
        },
      },
      provider: {
        model: expect.objectContaining({
          api: 'claude-code',
          id: 'claude-sonnet-4-6',
        }),
        providerOptions: {
          oauthToken: 'oauth-token',
          betaFlag: 'oauth-2025-04-20',
          billingHeader: 'x-billing-account: acc-123',
          thinking: {
            type: 'adaptive',
          },
          cache_control: {
            type: 'ephemeral',
          },
          output_config: {
            effort: 'medium',
          },
        },
      },
    });
  });

  it('maps low to minimal for google flash models', async () => {
    const keysFilePath = await createTempKeysFile();
    await setProviderCredentials(keysFilePath, 'google', {
      apiKey: 'google-key',
    });

    const result = await resolveModelInput({
      modelId: 'google/gemini-3-flash-preview',
      reasoningEffort: 'low',
      keysFilePath,
    });

    expect(result).toEqual({
      ok: true,
      api: 'google',
      modelId: 'google/gemini-3-flash-preview',
      keysFilePath,
      model: expect.objectContaining({
        api: 'google',
        id: 'gemini-3-flash-preview',
      }),
      providerOptions: {
        apiKey: 'google-key',
        thinkingConfig: {
          thinkingLevel: 'MINIMAL',
        },
      },
      provider: {
        model: expect.objectContaining({
          api: 'google',
          id: 'gemini-3-flash-preview',
        }),
        providerOptions: {
          apiKey: 'google-key',
          thinkingConfig: {
            thinkingLevel: 'MINIMAL',
          },
        },
      },
    });
  });

  it('bumps low up to low on google 3.1 pro because minimal is not supported', async () => {
    const keysFilePath = await createTempKeysFile();
    await setProviderCredentials(keysFilePath, 'google', {
      apiKey: 'google-key',
    });

    const result = await resolveModelInput({
      modelId: 'google/gemini-3.1-pro-preview',
      reasoningEffort: 'low',
      keysFilePath,
    });

    expect(result).toEqual({
      ok: true,
      api: 'google',
      modelId: 'google/gemini-3.1-pro-preview',
      keysFilePath,
      model: expect.objectContaining({
        api: 'google',
        id: 'gemini-3.1-pro-preview',
      }),
      providerOptions: {
        apiKey: 'google-key',
        thinkingConfig: {
          thinkingLevel: 'LOW',
        },
      },
      provider: {
        model: expect.objectContaining({
          api: 'google',
          id: 'gemini-3.1-pro-preview',
        }),
        providerOptions: {
          apiKey: 'google-key',
          thinkingConfig: {
            thinkingLevel: 'LOW',
          },
        },
      },
    });
  });

  it('maps xhigh to high for google models', async () => {
    const keysFilePath = await createTempKeysFile();
    await setProviderCredentials(keysFilePath, 'google', {
      apiKey: 'google-key',
    });

    const result = await resolveModelInput({
      modelId: 'google/gemini-3.1-flash-lite-preview',
      reasoningEffort: 'xhigh',
      keysFilePath,
    });

    expect(result).toEqual({
      ok: true,
      api: 'google',
      modelId: 'google/gemini-3.1-flash-lite-preview',
      keysFilePath,
      model: expect.objectContaining({
        api: 'google',
        id: 'gemini-3.1-flash-lite-preview',
      }),
      providerOptions: {
        apiKey: 'google-key',
        thinkingConfig: {
          thinkingLevel: 'HIGH',
        },
      },
      provider: {
        model: expect.objectContaining({
          api: 'google',
          id: 'gemini-3.1-flash-lite-preview',
        }),
        providerOptions: {
          apiKey: 'google-key',
          thinkingConfig: {
            thinkingLevel: 'HIGH',
          },
        },
      },
    });
  });

  it('uses the SDK default keysFilePath when none is provided', async () => {
    const keysFilePath = await createTempKeysFile();
    setSdkConfig({ keysFilePath });
    await setProviderCredentials(keysFilePath, 'openai', {
      apiKey: 'openai-key',
    });

    const result = await resolveModelInput({
      modelId: 'openai/gpt-5.4-nano',
    });

    expect(result.ok).toBe(true);
    if (!result.ok) {
      throw new Error('Expected successful resolution.');
    }

    expect(result.keysFilePath).toBe(keysFilePath);
    expect(getSdkConfig().keysFilePath).toBe(keysFilePath);
  });

  it('returns a clear error for unsupported model ids', async () => {
    const result = await resolveModelInput({
      modelId: 'google/gemini-2.5-flash',
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected unsupported model error.');
    }

    expect(result.keysFilePath).toBe(DEFAULT_KEYS_FILE_PATH);
    expect(result.error).toEqual({
      code: 'unsupported_model_id',
      message: `Unsupported modelId "google/gemini-2.5-flash". Available models: ${CuratedModelIds.join(', ')}`,
      modelId: 'google/gemini-2.5-flash',
      supportedModelIds: [...CuratedModelIds],
    });
  });

  it('returns provider credential errors from the standardized path', async () => {
    const keysFilePath = await createTempKeysFile();
    await writeFile(keysFilePath, '', 'utf8');

    const result = await resolveModelInput({
      modelId: 'codex/gpt-5.4-mini',
      keysFilePath,
    });

    expect(result.ok).toBe(false);
    if (result.ok) {
      throw new Error('Expected missing credentials error.');
    }

    expect(result.error.code).toBe('missing_provider_credentials');
    if (result.error.code !== 'missing_provider_credentials') {
      throw new Error('Expected missing_provider_credentials.');
    }

    expect(result.error.provider).toBe('codex');
    expect(result.error.path).toBe(keysFilePath);
  });
});
