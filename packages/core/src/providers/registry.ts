/**
 * Provider registry
 *
 * Maps API identifiers to their stream functions and mock message factories.
 * Providers self-register by calling registerProvider() from their index.ts.
 * Custom providers can also be added via registerProvider().
 */

import type { StreamFunction } from '../utils/types.js';
import type { Api } from '@ank1015/llm-types';

/** A mock message factory that creates a provider-native message shell. */
export type MockMessageFactory = (modelId: string, messageId: string) => unknown;

/** Full registration for a built-in or custom provider. */
export interface ProviderRegistration {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: StreamFunction<any>;
  getMockNativeMessage: MockMessageFactory;
}

 
const registry = new Map<string, ProviderRegistration>();

/**
 * Get the stream function for a provider.
 *
 * @param api - The API provider identifier
 * @returns The stream function, or undefined if not registered
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function getProviderStream(api: string): StreamFunction<any> | undefined {
  return registry.get(api)?.stream;
}

/**
 * Get the mock message factory for a provider.
 *
 * @param api - The API provider identifier
 * @returns The mock message factory, or undefined if not registered
 */
export function getProviderMockMessage(api: string): MockMessageFactory | undefined {
  return registry.get(api)?.getMockNativeMessage;
}

/**
 * Register a provider.
 *
 * Accepts either a full ProviderRegistration (stream + mock factory)
 * or a bare StreamFunction for backwards compatibility with external callers.
 *
 * @param api - The API provider identifier (e.g. 'ollama', 'together')
 * @param registration - A ProviderRegistration or bare StreamFunction
 *
 * @example
 * ```typescript
 * // Full registration (preferred for built-in providers)
 * registerProvider('deepseek', {
 *   stream: streamDeepSeek,
 *   getMockNativeMessage: getMockDeepSeekMessage,
 * });
 *
 * // Bare stream function (backwards compat for external callers)
 * registerProvider('ollama', streamOllama);
 * ```
 */
export function registerProvider<TApi extends Api>(
  api: TApi | (string & {}),
  registration: ProviderRegistration | StreamFunction<TApi>
): void {
  if (typeof registration === 'function') {
    // Backwards compat: bare StreamFunction — no mock factory available
    registry.set(api, {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stream: registration as StreamFunction<any>,
      getMockNativeMessage: () => ({}),
    });
  } else {
    registry.set(api, registration);
  }
}
