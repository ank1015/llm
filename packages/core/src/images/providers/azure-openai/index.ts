import { registerImageProvider } from '../registry.js';

import { generateAzureOpenAIImage } from './generate.js';

registerImageProvider('azure-openai', {
  generate: generateAzureOpenAIImage,
});

export { generateAzureOpenAIImage } from './generate.js';
