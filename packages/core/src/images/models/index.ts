import { azureOpenAIImageModels } from './azure-openai.js';
import { googleImageModels } from './google.js';
import { openaiImageModels } from './openai.js';

export const IMAGE_MODELS = {
  openai: openaiImageModels,
  'azure-openai': azureOpenAIImageModels,
  google: googleImageModels,
};

export { calculateImageCost, getImageModel, getImageModels, getImageProviders } from './utils.js';
