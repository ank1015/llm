import { registerProvider } from '../registry.js';

import { streamAzureOpenAI } from './stream.js';
import { getMockAzureOpenAIMessage } from './utils.js';

registerProvider('azure-openai', {
  stream: streamAzureOpenAI,
  getMockNativeMessage: getMockAzureOpenAIMessage,
});

export { streamAzureOpenAI } from './stream.js';
export { getMockAzureOpenAIMessage } from './utils.js';
