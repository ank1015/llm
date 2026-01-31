/**
 * @ank1015/llm-core
 *
 * Core SDK for LLM interactions.
 */

export const VERSION = "0.0.1";

// Models
export { MODELS } from "./models.generated.js";
export { getProviders, getModel, getModels, calculateCost } from "./models.js";

// Utilities
export {
	EventStream,
	AssistantMessageEventStream,
	parseStreamingJson,
	isContextOverflow,
	getOverflowPatterns,
	sanitizeSurrogates,
	validateToolCall,
	validateToolArguments,
} from "./utils/index.js";
export type { CompleteFunction, StreamFunction } from "./utils/index.js";

// Providers
export { completeAnthropic, streamAnthropic } from "./providers/anthropic/index.js";
export { completeOpenAI, streamOpenAI } from "./providers/openai/index.js";
export { completeGoogle, streamGoogle, GoogleThinkingLevel } from "./providers/google/index.js";
export { completeDeepSeek, streamDeepSeek } from "./providers/deepseek/index.js";
export { completeZai, streamZai } from "./providers/zai/index.js";
export { completeKimi, streamKimi } from "./providers/kimi/index.js";

// Re-export types from @ank1015/llm-types for convenience
export type * from "@ank1015/llm-types";
