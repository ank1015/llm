import { registerProvider } from '../registry.js';

import { streamZai } from './stream.js';
import { getMockZaiMessage } from './utils.js';

registerProvider('zai', {
  stream: streamZai,
  getMockNativeMessage: getMockZaiMessage,
});

export { streamZai } from './stream.js';
export { getMockZaiMessage } from './utils.js';
