import { registerProvider } from '../registry.js';

import { streamDeepSeek } from './stream.js';
import { getMockDeepSeekMessage } from './utils.js';

registerProvider('deepseek', {
  stream: streamDeepSeek,
  getMockNativeMessage: getMockDeepSeekMessage,
});

export { streamDeepSeek } from './stream.js';
export { getMockDeepSeekMessage } from './utils.js';
