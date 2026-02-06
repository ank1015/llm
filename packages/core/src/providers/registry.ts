/**
 * Provider registry
 *
 * Maps API identifiers to their stream functions.
 * Built-in providers are registered at module load.
 * Custom providers can be added via registerProvider().
 */

import { streamAnthropic } from './anthropic/stream.js';
import { streamDeepSeek } from './deepseek/stream.js';
import { streamGoogle } from './google/stream.js';
import { streamKimi } from './kimi/stream.js';
import { streamOpenAI } from './openai/stream.js';
import { streamZai } from './zai/stream.js';

import type { StreamFunction } from '../utils/types.js';
import type { Api } from '@ank1015/llm-types';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const registry = new Map<string, StreamFunction<any>>([
  ['anthropic', streamAnthropic],
  ['openai', streamOpenAI],
  ['google', streamGoogle],
  ['deepseek', streamDeepSeek],
  ['kimi', streamKimi],
  ['zai', streamZai],
]);

/**
 * Get the stream function for a provider.
 *
 * @param api - The API provider identifier
 * @returns The stream function, or undefined if not registered
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getProviderStream(api: string): StreamFunction<any> | undefined {
  return registry.get(api);
}

/**
 * Register a custom provider.
 *
 * Use this to add providers that aren't built in, or to override
 * a built-in provider with a custom implementation.
 *
 * @param api - The API provider identifier (e.g. 'ollama', 'together')
 * @param streamFn - The stream function for this provider
 *
 * @example
 * ```typescript
 * registerProvider('ollama', streamOllama);
 * // Now stream() and complete() will dispatch to streamOllama
 * // when model.api === 'ollama'
 * ```
 */
export function registerProvider<TApi extends Api>(
  api: TApi | (string & {}),
  streamFn: StreamFunction<TApi>
): void {
  registry.set(api, streamFn);
}
