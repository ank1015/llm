import { existsSync } from 'node:fs';

import { afterAll, beforeAll, expect, it } from 'vitest';

import { describeIfAvailable } from '../../../core/tests/integration/helpers/live.js';
import {
  DEFAULT_GATEWAY_CREDENTIALS_PATH,
  resetSdkConfig,
  setSdkConfig,
} from '../../src/config.js';
import { getGatewayAccessCredentials, readGatewayCredentials } from '../../src/gateway.js';
import { getText, llm, userMessage } from '../../src/index.js';

const gatewayCredentialsPath =
  process.env['LLM_GATEWAY_CREDENTIALS_PATH']?.trim() || DEFAULT_GATEWAY_CREDENTIALS_PATH;

const describeIfGateway = describeIfAvailable(existsSync(gatewayCredentialsPath));

describeIfGateway('SDK llm() gateway integration', () => {
  beforeAll(() => {
    setSdkConfig({
      gatewayCredentialsPath,
      modelTransport: 'gateway',
    });
  });

  afterAll(() => {
    resetSdkConfig();
  });

  it('refreshes the gateway access token and rewrites the credential file', async () => {
    const before = await readGatewayCredentials(gatewayCredentialsPath);
    const refreshed = await getGatewayAccessCredentials({
      forceRefresh: true,
      path: gatewayCredentialsPath,
    });
    const after = await readGatewayCredentials(gatewayCredentialsPath);

    expect(refreshed.gatewayBaseUrl).toBe(before.gatewayBaseUrl);
    expect(after.gatewayBaseUrl).toBe(before.gatewayBaseUrl);
    expect(after.accessToken).toBe(refreshed.accessToken);
    expect(after.refreshToken).toBe(refreshed.refreshToken);
    expect(after.accessTokenExpiresAt).toBeGreaterThan(Date.now());
    expect(after.refreshTokenExpiresAt).toBeGreaterThan(Date.now());
  }, 45000);

  it('gets a real LLM response through the OpenAI gateway provider', async () => {
    const result = await llm({
      modelId: 'openai/gpt-5.4-nano',
      reasoningEffort: 'low',
      messages: [
        userMessage('Reply with exactly SDK_GATEWAY_OPENAI_OK', {
          id: 'user-sdk-gateway-openai-ok',
        }),
      ],
      overrideProviderSetting: {
        max_output_tokens: 64,
      },
      requestId: 'sdk-gateway-openai-live',
    });

    expect(result.role).toBe('assistant');
    expect(result.api).toBe('openai');
    expect(result.id).toBe('sdk-gateway-openai-live');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(getText(result)).toContain('SDK_GATEWAY_OPENAI_OK');
  }, 60000);

  it('gets a real LLM response through the Azure OpenAI gateway provider', async () => {
    const result = await llm({
      modelId: 'azure-openai/gpt-5.4-nano',
      reasoningEffort: 'low',
      messages: [
        userMessage('Reply with exactly SDK_GATEWAY_AZURE_OK', {
          id: 'user-sdk-gateway-azure-ok',
        }),
      ],
      overrideProviderSetting: {
        max_output_tokens: 64,
      },
      requestId: 'sdk-gateway-azure-live',
    });

    expect(result.role).toBe('assistant');
    expect(result.api).toBe('azure-openai');
    expect(result.id).toBe('sdk-gateway-azure-live');
    expect(result.usage.totalTokens).toBeGreaterThan(0);
    expect(getText(result)).toContain('SDK_GATEWAY_AZURE_OK');
  }, 60000);
});
