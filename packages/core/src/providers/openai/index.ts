import { registerProvider } from '../registry.js';

import { streamOpenAI } from './stream.js';
import { getMockOpenaiMessage } from './utils.js';

registerProvider('openai', {
  stream: streamOpenAI,
  getMockNativeMessage: getMockOpenaiMessage,
});

export { streamOpenAI } from './stream.js';
export { getMockOpenaiMessage } from './utils.js';
