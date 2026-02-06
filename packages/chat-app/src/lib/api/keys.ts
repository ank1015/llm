import { isValidApi } from '@ank1015/llm-sdk';
import { createFileKeysAdapter } from '@ank1015/llm-sdk-adapters';

import type { Api } from '@ank1015/llm-sdk';
import type { FileKeysAdapter } from '@ank1015/llm-sdk-adapters';

export function createKeysAdapter(): FileKeysAdapter {
  const keysDir = process.env.LLM_KEYS_DIR;
  return createFileKeysAdapter(keysDir);
}

export function parseApi(value: string): Api | undefined {
  return isValidApi(value) ? value : undefined;
}
