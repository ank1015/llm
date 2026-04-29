import { registerProvider } from '../registry.js';

import { streamAwsBedrock } from './stream.js';
import { getMockAwsBedrockMessage } from './utils.js';

registerProvider('aws-bedrock', {
  stream: streamAwsBedrock,
  getMockNativeMessage: getMockAwsBedrockMessage,
});

export { streamAwsBedrock } from './stream.js';
