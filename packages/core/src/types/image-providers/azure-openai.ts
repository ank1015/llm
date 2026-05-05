import type {
  ImageEditParamsNonStreaming,
  ImageGenerateParamsNonStreaming,
  ImagesResponse,
} from 'openai/resources/images.js';

export type AzureOpenAIImageNativeResponse = ImagesResponse;

interface AzureOpenAIImageProps {
  apiKey: string;
  signal?: AbortSignal;
  azureApiVersion?: string;
  azureBaseURL?: string;
  azureEndpoint?: string;
  azureResourceName?: string;
  azureDeploymentName?: string;
}

type AzureOpenAIImageGenerateOptions = Omit<
  ImageGenerateParamsNonStreaming,
  'model' | 'prompt' | 'stream'
>;
type AzureOpenAIImageEditOptions = Omit<
  ImageEditParamsNonStreaming,
  'model' | 'prompt' | 'image' | 'mask' | 'stream'
>;

export type AzureOpenAIImageProviderOptions = AzureOpenAIImageGenerateOptions &
  AzureOpenAIImageEditOptions &
  AzureOpenAIImageProps;
