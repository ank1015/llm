/**
 * SDK Configuration
 */

let serverUrl = 'http://localhost:3001';

/**
 * Set the server URL for API calls when no apiKey is provided.
 */
export function setServerUrl(url: string): void {
  serverUrl = url;
}

/**
 * Get the current server URL.
 */
export function getServerUrl(): string {
  return serverUrl;
}
