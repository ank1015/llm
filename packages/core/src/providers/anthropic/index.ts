import { registerProvider } from '../registry.js';

import { streamAnthropic } from './stream.js';
import { getMockAnthropicMessage } from './utils.js';

registerProvider('anthropic', {
  stream: streamAnthropic,
  getMockNativeMessage: getMockAnthropicMessage,
});

export { streamAnthropic } from './stream.js';
export { getMockAnthropicMessage } from './utils.js';
