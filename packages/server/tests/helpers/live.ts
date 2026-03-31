import { getSdkConfig } from '@ank1015/llm-sdk/config';
import { resolveProviderCredentials } from '@ank1015/llm-sdk/keys';

export async function requireCodexLiveCredentials(): Promise<{ keysFilePath: string }> {
  const { keysFilePath } = getSdkConfig();
  const result = await resolveProviderCredentials(keysFilePath, 'codex');

  if (result.ok) {
    return { keysFilePath };
  }

  const spec =
    result.error.code === 'missing_provider_credentials'
      ? result.error.missing.map((field) => `${field.option} -> ${field.env}`).join(', ')
      : 'apiKey -> CODEX_API_KEY, chatgpt-account-id -> CODEX_CHATGPT_ACCOUNT_ID';

  throw new Error(
    [
      `Missing Codex live test credentials in the SDK central keystore: ${keysFilePath}.`,
      `Required fields: ${spec}.`,
      'Populate the central keystore first, then rerun `pnpm --filter @ank1015/llm-server test:live`.',
    ].join(' ')
  );
}
