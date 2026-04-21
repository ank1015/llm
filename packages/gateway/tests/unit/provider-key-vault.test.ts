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
});
