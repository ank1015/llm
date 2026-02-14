import { registerProvider } from '../registry.js';

import { streamMinimax } from './stream.js';
import { getMockMinimaxMessage } from './utils.js';

registerProvider('minimax', {
  stream: streamMinimax,
  getMockNativeMessage: getMockMinimaxMessage,
});

export { streamMinimax } from './stream.js';
export { getMockMinimaxMessage } from './utils.js';
