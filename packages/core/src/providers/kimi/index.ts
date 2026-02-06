import { registerProvider } from '../registry.js';

import { streamKimi } from './stream.js';
import { getMockKimiMessage } from './utils.js';

registerProvider('kimi', {
  stream: streamKimi,
  getMockNativeMessage: getMockKimiMessage,
});

export { streamKimi } from './stream.js';
export { getMockKimiMessage } from './utils.js';
