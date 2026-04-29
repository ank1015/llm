import { anthropicModels } from './anthropic.js';
import { awsBedrockModels } from './aws-bedrock.js';
import { azureOpenAIModels } from './azure-openai.js';
import { cerebrasModels } from './cerebras.js';
import { claudeCodeModels } from './claude-code.js';
import { codexModels } from './codex.js';
import { deepseekModels } from './deepseek.js';
import { googleModels } from './google.js';
import { kimiModels } from './kimi.js';
import { minimaxModels } from './minimax.js';
import { openaiModels } from './openai.js';
import { openrouterModels } from './openrouter.js';
import { zaiModels } from './zai.js';

export const MODELS = {
  openai: openaiModels,
  'azure-openai': azureOpenAIModels,
  'aws-bedrock': awsBedrockModels,
  codex: codexModels,
  google: googleModels,
  deepseek: deepseekModels,
  anthropic: anthropicModels,
  'claude-code': claudeCodeModels,
  zai: zaiModels,
  kimi: kimiModels,
  minimax: minimaxModels,
  cerebras: cerebrasModels,
  openrouter: openrouterModels,
};

export { getProviders, getModel, getModels, calculateCost } from './utils.js';
