import { registerProvider } from '../registry.js';

import { streamCerebras } from './stream.js';
import { getMockCerebrasMessage } from './utils.js';

registerProvider('cerebras', {
  stream: streamCerebras,
  getMockNativeMessage: getMockCerebrasMessage,
});

export { streamCerebras } from './stream.js';
export { getMockCerebrasMessage } from './utils.js';
