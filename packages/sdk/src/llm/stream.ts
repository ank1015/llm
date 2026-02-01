/**
 * SDK stream function
 *
 * Routes to core's stream function if apiKey is provided,
 * otherwise calls the server's /messages/stream endpoint.
 */

import { stream as coreStream, AssistantMessageEventStream } from "@ank1015/llm-core";
import type { Api, BaseAssistantMessage, BaseAssistantEvent, Context, Model, OptionsForApi, MessageRequest } from "@ank1015/llm-types";
import { ProviderError, StreamError } from "@ank1015/llm-types";
import { getServerUrl } from "../config.js";

/**
 * Parse SSE data from a text line.
 */
function parseSSELine(line: string): { event?: string; data?: string } | null {
	if (line.startsWith("event:")) {
		return { event: line.slice(6).trim() };
	}
	if (line.startsWith("data:")) {
		return { data: line.slice(5).trim() };
	}
	return null;
}

/**
 * Stream a chat request.
 *
 * If options.apiKey is provided, calls the provider directly via core.
 * Otherwise, calls the server which uses stored API keys and tracks usage.
 *
 * @param model - The model configuration
 * @param context - The conversation context (messages, system prompt, tools)
 * @param options - Provider-specific options (apiKey optional)
 * @param id - Unique request ID
 * @returns An event stream of assistant message events
 */
export function stream<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options: Partial<OptionsForApi<TApi>> = {},
	id?: string,
): AssistantMessageEventStream<TApi> {
	// If apiKey is provided, use core's stream directly
	if ("apiKey" in options && options.apiKey) {
		const requestId = id ?? `sdk-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
		return coreStream(model, context, options as OptionsForApi<TApi>, requestId);
	}

	// Otherwise, call the server and create our own event stream
	const eventStream = new AssistantMessageEventStream<TApi>();

	// Start the fetch in the background
	streamFromServer(model, context, options, eventStream).catch(() => {
		// Error already handled in streamFromServer
	});

	return eventStream;
}

/**
 * Internal function to stream from the server.
 */
async function streamFromServer<TApi extends Api>(
	model: Model<TApi>,
	context: Context,
	options: Partial<OptionsForApi<TApi>>,
	eventStream: AssistantMessageEventStream<TApi>,
): Promise<void> {
	const serverUrl = getServerUrl();

	// Build request body
	const request: MessageRequest<TApi> = {
		api: model.api,
		modelId: model.id,
		messages: context.messages,
	};

	if (context.systemPrompt) {
		request.systemPrompt = context.systemPrompt;
	}

	if (context.tools) {
		request.tools = context.tools;
	}

	// Pass through provider options (excluding apiKey and signal)
	const { apiKey: _, signal, ...providerOptions } = options as Record<string, unknown> & { signal?: AbortSignal };
	if (Object.keys(providerOptions).length > 0) {
		request.providerOptions = providerOptions as Exclude<MessageRequest<TApi>["providerOptions"], undefined>;
	}

	const fetchOptions: RequestInit = {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify(request),
	};
	if (signal) {
		fetchOptions.signal = signal;
	}

	let response: Response;
	try {
		response = await fetch(`${serverUrl}/messages/stream`, fetchOptions);
	} catch (error) {
		const message = error instanceof Error ? error.message : String(error);
		throw new ProviderError(model.api, message);
	}

	if (!response.ok) {
		const errorData = (await response.json()) as { message?: string };
		throw new ProviderError(model.api, errorData.message ?? "Server request failed");
	}

	if (!response.body) {
		throw new StreamError("No response body");
	}

	const reader = response.body.getReader();
	const decoder = new TextDecoder();
	let buffer = "";
	let currentEvent = "";
	let finalMessage: BaseAssistantMessage<TApi> | null = null;

	try {
		while (true) {
			const { done, value } = await reader.read();

			if (done) break;

			buffer += decoder.decode(value, { stream: true });

			// Process complete lines
			const lines = buffer.split("\n");
			buffer = lines.pop() ?? "";

			for (const line of lines) {
				const trimmed = line.trim();
				if (!trimmed) continue;

				const parsed = parseSSELine(trimmed);
				if (!parsed) continue;

				if (parsed.event) {
					currentEvent = parsed.event;
				} else if (parsed.data && currentEvent) {
					try {
						const data: unknown = JSON.parse(parsed.data);

						if (currentEvent === "message") {
							// Final message
							finalMessage = data as BaseAssistantMessage<TApi>;
						} else if (currentEvent === "error") {
							// Error event
							const errorData = data as { message?: string };
							const errorMessage = errorData.message ?? "Stream error";
							throw new ProviderError(model.api, errorMessage);
						} else {
							// Regular event
							eventStream.push(data as BaseAssistantEvent<TApi>);
						}
					} catch (parseError) {
						if (parseError instanceof ProviderError) throw parseError;
						// Ignore JSON parse errors for malformed data
					}
					currentEvent = "";
				}
			}
		}

		// End the stream with the final message
		if (finalMessage) {
			eventStream.end(finalMessage);
		} else {
			throw new StreamError("No final message received");
		}
	} catch (error) {
		// Create an error message to end the stream
		const errorMessage = error instanceof Error ? error.message : String(error);
		const errorResponse = {
			role: "assistant" as const,
			message: {} as BaseAssistantMessage<TApi>["message"],
			api: model.api,
			id: "",
			model: model,
			errorMessage,
			timestamp: Date.now(),
			duration: 0,
			stopReason: "error" as const,
			content: [],
			usage: {
				input: 0,
				output: 0,
				cacheRead: 0,
				cacheWrite: 0,
				totalTokens: 0,
				cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
			},
		} as BaseAssistantMessage<TApi>;
		eventStream.end(errorResponse);
	}
}
