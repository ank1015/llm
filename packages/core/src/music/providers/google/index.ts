import { registerMusicProvider } from '../registry.js';

import { generateGoogleMusic } from './generate.js';

registerMusicProvider('google', {
  generate: generateGoogleMusic,
});

export { generateGoogleMusic } from './generate.js';
