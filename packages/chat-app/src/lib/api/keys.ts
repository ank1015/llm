import { createFileKeysAdapter, isValidApi } from '@ank1015/llm-sdk';

import type { Api, FileKeysAdapter } from '@ank1015/llm-sdk';

export function createKeysAdapter(): FileKeysAdapter {
  const keysDir = process.env.LLM_KEYS_DIR;
  return createFileKeysAdapter(keysDir);
}

export function parseApi(value: string): Api | undefined {
  return isValidApi(value) ? value : undefined;
}
