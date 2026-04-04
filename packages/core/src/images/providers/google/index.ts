import { registerImageProvider } from '../registry.js';

import { generateGoogleImage } from './generate.js';

registerImageProvider('google', {
  generate: generateGoogleImage,
});

export { generateGoogleImage } from './generate.js';
