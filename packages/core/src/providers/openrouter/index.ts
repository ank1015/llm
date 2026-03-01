import { registerProvider } from '../registry.js';

import { streamOpenRouter } from './stream.js';
import { getMockOpenRouterMessage } from './utils.js';

registerProvider('openrouter', {
  stream: streamOpenRouter,
  getMockNativeMessage: getMockOpenRouterMessage,
});

export { streamOpenRouter } from './stream.js';
export { getMockOpenRouterMessage } from './utils.js';
