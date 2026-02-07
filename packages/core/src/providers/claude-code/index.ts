import { registerProvider } from '../registry.js';

import { streamClaudeCode } from './stream.js';
import { getMockClaudeCodeMessage } from './utils.js';

registerProvider('claude-code', {
  stream: streamClaudeCode,
  getMockNativeMessage: getMockClaudeCodeMessage,
});

export { streamClaudeCode } from './stream.js';
export { getMockClaudeCodeMessage } from './utils.js';
