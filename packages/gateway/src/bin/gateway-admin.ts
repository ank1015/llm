#!/usr/bin/env node

import { createGatewayAuth } from '../auth/tokens.js';
import { getGatewayConfig } from '../config.js';
import { createGatewayDatabase } from '../db/index.js';
import { createProviderKeyVault, isGatewayApi } from '../vault/provider-key-vault.js';

// Small command router; each branch exits immediately after handling its command.
// eslint-disable-next-line sonarjs/cognitive-complexity
async function main(): Promise<void> {
  const [command, ...args] = process.argv.slice(2);
  const config = getGatewayConfig();
  const db = createGatewayDatabase(config);
  const auth = createGatewayAuth(db, config);
  const vault = createProviderKeyVault(db, config);

  try {
    switch (command) {
      case 'create-sender': {
        const name = args.join(' ').trim();
        if (!name) {
          throw new Error('Usage: llm-gateway-admin create-sender <name>');
        }

        process.stdout.write(`${JSON.stringify({ sender: db.createSender({ name }) }, null, 2)}\n`);
        return;
      }
      case 'issue-tokens': {
        const [senderId] = args;
        if (!senderId) {
          throw new Error('Usage: llm-gateway-admin issue-tokens <senderId>');
        }

        process.stdout.write(`${JSON.stringify(await auth.issueTokenPair(senderId), null, 2)}\n`);
        return;
      }
      case 'set-provider-key': {
        const [api, apiKey, azureDeploymentUrl, azureDeploymentName] = args;
        if (!api || !apiKey) {
          throw new Error(
            'Usage: llm-gateway-admin set-provider-key <api> <apiKey> [azureDeploymentUrl] [azureDeploymentName]'
          );
        }

        if (!isGatewayApi(api)) {
          throw new Error(`Unsupported gateway provider "${api}".`);
        }

        if (api === 'azure-openai') {
          if (!azureDeploymentUrl) {
            throw new Error(
              'Usage: llm-gateway-admin set-provider-key azure-openai <apiKey> <azureDeploymentUrl> [azureDeploymentName]'
            );
          }

          vault.setProviderCredentials(api, {
            apiKey,
            azureDeploymentUrl,
            ...(azureDeploymentName ? { azureDeploymentName } : {}),
          });
        } else {
          vault.setApiKey(api, apiKey);
        }
        process.stdout.write(`${JSON.stringify({ ok: true, api }, null, 2)}\n`);
        return;
      }
      case 'usage': {
        const [senderId] = args;
        process.stdout.write(
          `${JSON.stringify(db.getUsageSummary(senderId ? { senderId } : {}), null, 2)}\n`
        );
        return;
      }
      default: {
        throw new Error(
          'Usage: llm-gateway-admin <create-sender|issue-tokens|set-provider-key|usage> ...'
        );
      }
    }
  } finally {
    db.close();
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
