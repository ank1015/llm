import { registerImageProvider } from '../registry.js';

import { generateOpenAIImage } from './generate.js';

registerImageProvider('openai', {
  generate: generateOpenAIImage,
});

export { generateOpenAIImage } from './generate.js';
