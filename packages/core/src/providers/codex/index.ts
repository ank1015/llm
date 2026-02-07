import { registerProvider } from '../registry.js';

import { streamCodex } from './stream.js';
import { getMockCodexMessage } from './utils.js';

registerProvider('codex', {
  stream: streamCodex,
  getMockNativeMessage: getMockCodexMessage,
});

export { streamCodex } from './stream.js';
export { getMockCodexMessage } from './utils.js';
