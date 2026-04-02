/**
 * Public provider registry helpers.
 *
 * Built-in providers self-register through side effects in the package root.
 * External integrations can register additional providers at runtime.
 */

export { registerProvider } from './registry.js';

export type { MockMessageFactory, ProviderRegistration } from './registry.js';
