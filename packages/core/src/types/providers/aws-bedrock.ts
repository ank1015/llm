/**
 * AWS Bedrock provider types
 */

import type {
  BedrockRuntimeClientConfig,
  ContentBlock,
  ConverseStreamCommandOutput,
  ConverseStreamCommandInput,
  ConverseStreamMetadataEvent,
  MessageStopEvent,
  ToolConfiguration,
} from '@aws-sdk/client-bedrock-runtime';

export type AwsBedrockThinkingDisplay = 'summarized' | 'omitted';

/**
 * AWS Bedrock native response type.
 *
 * ConverseStream yields events instead of one final assistant message, so core
 * preserves the accumulated Bedrock assistant content plus final metadata.
 */
export interface AwsBedrockNativeResponse {
  modelId: string;
  $metadata?: ConverseStreamCommandOutput['$metadata'];
  content: ContentBlock[];
  stopReason?: MessageStopEvent['stopReason'];
  usage?: ConverseStreamMetadataEvent['usage'];
  metrics?: ConverseStreamMetadataEvent['metrics'];
}

/**
 * Additional properties for AWS Bedrock provider
 */
interface AwsBedrockProps {
  signal?: AbortSignal;
  region: string;
  credentials?: BedrockRuntimeClientConfig['credentials'];
  profile?: string;
  endpoint?: BedrockRuntimeClientConfig['endpoint'];
  bearerToken?: string;
  toolChoice?: 'auto' | 'any' | 'none' | { type: 'tool'; name: string };
  reasoning?: 'minimal' | 'low' | 'medium' | 'high' | 'xhigh';
  thinkingBudgetTokens?: number;
  thinkingDisplay?: AwsBedrockThinkingDisplay;
  cacheRetention?: 'none' | 'short' | 'long';
  toolConfig?: ToolConfiguration;
}

/**
 * AWS Bedrock provider options.
 *
 * Extends ConverseStreamCommandInput with client settings and convenience
 * controls, omitting fields that are assembled from core context/model data.
 */
export type AwsBedrockProviderOptions = Omit<
  ConverseStreamCommandInput,
  'modelId' | 'messages' | 'system' | 'toolConfig'
> &
  AwsBedrockProps;
