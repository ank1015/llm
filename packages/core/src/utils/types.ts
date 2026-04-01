/**
 * LLM function types
 *
 * Defines the function signatures for complete and stream operations.
 */

import type { AssistantMessageEventStream } from './event-stream.js';
import type { Api, OptionsForApi, BaseAssistantMessage, Model, Context } from '../types/index.js';

/**
 * Function signature for non-streaming completion.
 *
 * @template TApi - The API provider type
 */
export type CompleteFunction<TApi extends Api> = (
  model: Model<TApi>,
  context: Context,
  options: OptionsForApi<TApi>,
  id: string
) => Promise<BaseAssistantMessage<TApi>>;

/**
 * Function signature for streaming completion.
 *
 * @template TApi - The API provider type
 */
export type StreamFunction<TApi extends Api> = (
  model: Model<TApi>,
  context: Context,
  options: OptionsForApi<TApi>,
  id: string
) => AssistantMessageEventStream<TApi>;
