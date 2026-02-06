import { ThinkingLevel } from '@google/genai';

import { registerProvider } from '../registry.js';

import { streamGoogle } from './stream.js';
import { getMockGoogleMessage } from './utils.js';

registerProvider('google', {
  stream: streamGoogle,
  getMockNativeMessage: (_modelId, _messageId) => getMockGoogleMessage(),
});

export { streamGoogle } from './stream.js';
export { getMockGoogleMessage } from './utils.js';
export { ThinkingLevel as GoogleThinkingLevel };
