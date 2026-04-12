import { registerVideoProvider } from '../registry.js';

import { generateGoogleVideo } from './generate.js';

registerVideoProvider('google', {
  generate: generateGoogleVideo,
});

export { generateGoogleVideo } from './generate.js';
