/**
 * API provider identifiers
 *
 * Defines the supported LLM providers and their type-safe identifiers.
 */

/**
 * Array of all known API provider identifiers.
 * Used to derive the Api union type and for runtime validation.
 */
export const KnownApis = [
  'openai',
  'codex',
  'google',
  'deepseek',
  'anthropic',
  'claude-code',
  'zai',
  'kimi',
  'minimax',
  'cerebras',
] as const;

/**
 * Union type of all supported API providers.
 *
 * @example
 * const provider: Api = 'anthropic';
 */
export type Api = (typeof KnownApis)[number];

/**
 * Type guard to check if a string is a valid Api.
 */
export function isValidApi(value: string): value is Api {
  return KnownApis.includes(value as Api);
}
