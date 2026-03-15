import type { Api } from '@ank1015/llm-types';

export function normalizeCredentials(
  api: Api,
  credentials: Record<string, string>
): Record<string, string> {
  const normalized = { ...credentials };

  if (api === 'codex') {
    const accountId =
      normalized['chatgpt-account-id'] ??
      normalized.chatgptAccountId ??
      normalized.accountId ??
      normalized.account_id;
    if (accountId) {
      normalized['chatgpt-account-id'] = accountId;
    }

    const apiKey = normalized.apiKey ?? normalized.access_token ?? normalized.accessToken;
    if (apiKey) {
      normalized.apiKey = apiKey;
    }

    delete normalized.chatgptAccountId;
    delete normalized.accountId;
    delete normalized.account_id;
    delete normalized.access_token;
    delete normalized.accessToken;
  }

  return normalized;
}
