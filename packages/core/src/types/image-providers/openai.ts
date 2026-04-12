import type {
  ImageEditParamsNonStreaming,
  ImageGenerateParamsNonStreaming,
  ImagesResponse,
} from 'openai/resources/images.js';

export type OpenAIImageNativeResponse = ImagesResponse;

interface OpenAIImageProps {
  apiKey: string;
  signal?: AbortSignal;
}

type OpenAIImageGenerateOptions = Omit<
  ImageGenerateParamsNonStreaming,
  'model' | 'prompt' | 'stream'
>;
type OpenAIImageEditOptions = Omit<
  ImageEditParamsNonStreaming,
  'model' | 'prompt' | 'image' | 'mask' | 'stream'
>;

export type OpenAIImageProviderOptions = OpenAIImageGenerateOptions &
  OpenAIImageEditOptions &
  OpenAIImageProps;
