import { describe, expect, it } from 'vitest';

import { getGatewayConfig } from '../../src/config.js';
import { createGatewayDatabase } from '../../src/db/index.js';
import { createProviderKeyVault } from '../../src/vault/provider-key-vault.js';

describe('provider key vault', () => {
  it('encrypts keys in sqlite and reloads them into cache', () => {
    const config = getGatewayConfig({
      dbPath: ':memory:',
      jwtSecret: 'jwt-secret',
      encryptionKey: Buffer.alloc(32, 9).toString('base64'),
      adminToken: 'admin-token',
    });
    const db = createGatewayDatabase(config);

    const firstVault = createProviderKeyVault(db, config);
    firstVault.setApiKey('openai', 'sk-openai');

    expect(firstVault.getApiKey('openai')).toBe('sk-openai');

    const rows = db.listProviderKeys();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ciphertext.equals(Buffer.from('sk-openai'))).toBe(false);

    const secondVault = createProviderKeyVault(db, config);
    expect(secondVault.getApiKey('openai')).toBe('sk-openai');

    db.close();
  });

  it('encrypts and reloads Azure OpenAI provider credentials', () => {
    const config = getGatewayConfig({
      dbPath: ':memory:',
      jwtSecret: 'jwt-secret',
      encryptionKey: Buffer.alloc(32, 9).toString('base64'),
      adminToken: 'admin-token',
    });
    const db = createGatewayDatabase(config);

    const firstVault = createProviderKeyVault(db, config);
    firstVault.setProviderCredentials('azure-openai', {
      apiKey: 'azure-key',
      azureDeploymentUrl:
        'https://resource.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview',
      azureDeploymentName: 'gpt-5.4-nano',
    });

    expect(firstVault.getApiKey('azure-openai')).toBe('azure-key');
    expect(firstVault.getProviderCredentials('azure-openai')).toEqual({
      apiKey: 'azure-key',
      azureDeploymentUrl:
        'https://resource.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview',
      azureDeploymentName: 'gpt-5.4-nano',
    });

    const rows = db.listProviderKeys();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.ciphertext.includes(Buffer.from('azure-key'))).toBe(false);

    const secondVault = createProviderKeyVault(db, config);
    expect(secondVault.getProviderCredentials('azure-openai')).toEqual({
      apiKey: 'azure-key',
      azureDeploymentUrl:
        'https://resource.cognitiveservices.azure.com/openai/responses?api-version=2025-04-01-preview',
      azureDeploymentName: 'gpt-5.4-nano',
    });

    db.close();
  });
});
