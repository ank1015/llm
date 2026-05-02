import { beforeAll, expect, it } from 'vitest';

import { calculateImageCost, generateImage, getImageModel } from '../../../src/index.js';
import { describeIfAvailable, getIntegrationEnv } from '../helpers/live.js';

import type { BaseImageResult, ImageModel } from '../../../src/types/index.js';

const apiKey = getIntegrationEnv('AZURE_OPENAI_API_KEY');
const azureBaseURL =
  getIntegrationEnv('AZURE_OPENAI_IMAGE_BASE_URL') ??
  getIntegrationEnv('AZURE_OPENAI_TARGET_URI') ??
  getIntegrationEnv('AZURE_OPENAI_RESPONSES_URI') ??
  getIntegrationEnv('AZURE_OPENAI_BASE_URL');
const azureResourceName = getIntegrationEnv('AZURE_OPENAI_RESOURCE_NAME');
const azureDeploymentName =
  getIntegrationEnv('AZURE_OPENAI_IMAGE_DEPLOYMENT_NAME') ??
  getIntegrationEnv('AZURE_OPENAI_DEPLOYMENT_NAME');
const azureApiVersion = getIntegrationEnv('AZURE_OPENAI_API_VERSION');
const describeIfAzureOpenAIImage = describeIfAvailable(
  Boolean(apiKey && (azureBaseURL || azureResourceName))
);

describeIfAzureOpenAIImage('Azure OpenAI Image Integration', () => {
  let model: ImageModel<'azure-openai'>;

  beforeAll(() => {
    const testModel = getImageModel('azure-openai', 'gpt-image-2');
    if (!testModel) {
      throw new Error('Test model gpt-image-2 not found');
    }

    model = testModel;
  });

  it('should generate an image with normalized usage and cost', async () => {
    const result = await generateImage(
      model,
      {
        prompt:
          'Create a clean product-icon rendering of a cobalt kite on a white background. No text.',
      },
      {
        apiKey: apiKey!,
        ...(azureApiVersion ? { azureApiVersion } : {}),
        ...(azureDeploymentName ? { azureDeploymentName } : {}),
        ...(azureBaseURL ? { azureBaseURL } : { azureResourceName: azureResourceName! }),
        n: 1,
        output_format: 'png',
        quality: 'low',
        size: '1024x1024',
        user: 'llm-core-azure-openai-image-integration',
      },
      'azure-openai-image-generate-1'
    );

    expect(result.id).toBe('azure-openai-image-generate-1');
    expect(result.api).toBe('azure-openai');
    expect(result.model).toBe(model);
    expect(result.images).toHaveLength(1);
    expect(result.content).toEqual(result.images);
    expect(result.response.data).toHaveLength(1);
    expect(result.images.every((image) => image.mimeType === 'image/png')).toBe(true);

    expectImagePayloads(result);
    expectImageUsage(result);
    expectImageCost(model, result);
  }, 180000);
});

function expectImagePayloads(result: BaseImageResult<'azure-openai'>): void {
  for (const image of result.images) {
    expect(Buffer.from(image.data, 'base64').byteLength).toBeGreaterThan(0);
    expect(image.metadata?.generationProvider).toBe('azure-openai');
    expect(image.metadata?.generationStage).toBe('final');
  }
}

function expectImageUsage(result: BaseImageResult<'azure-openai'>): void {
  expect(result.usage.input).toBeGreaterThan(0);
  expect(result.usage.output).toBeGreaterThan(0);
  expect(result.usage.outputImage).toBeGreaterThan(0);
  expect(result.usage.totalTokens).toBeGreaterThan(0);
  expect(result.duration).toBeGreaterThanOrEqual(0);
}

function expectImageCost(
  model: ImageModel<'azure-openai'>,
  result: BaseImageResult<'azure-openai'>
): void {
  const { cost, ...usage } = result.usage;

  expect(cost).toEqual(calculateImageCost(model, usage));
  expect(cost.total).toBeGreaterThan(0);
}
