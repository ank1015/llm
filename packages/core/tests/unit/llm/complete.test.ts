import type { BaseAssistantMessage, Context, Model } from "@ank1015/llm-types";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all provider complete functions
vi.mock("../../../src/providers/anthropic/complete.js", () => ({
	completeAnthropic: vi.fn(),
}));
vi.mock("../../../src/providers/openai/complete.js", () => ({
	completeOpenAI: vi.fn(),
}));
vi.mock("../../../src/providers/google/complete.js", () => ({
	completeGoogle: vi.fn(),
}));
vi.mock("../../../src/providers/deepseek/complete.js", () => ({
	completeDeepSeek: vi.fn(),
}));
vi.mock("../../../src/providers/zai/complete.js", () => ({
	completeZai: vi.fn(),
}));
vi.mock("../../../src/providers/kimi/complete.js", () => ({
	completeKimi: vi.fn(),
}));

import { complete } from "../../../src/llm/complete.js";
import { completeAnthropic } from "../../../src/providers/anthropic/complete.js";
import { completeDeepSeek } from "../../../src/providers/deepseek/complete.js";
import { completeGoogle } from "../../../src/providers/google/complete.js";
import { completeKimi } from "../../../src/providers/kimi/complete.js";
import { completeOpenAI } from "../../../src/providers/openai/complete.js";
import { completeZai } from "../../../src/providers/zai/complete.js";

// Helper to create mock model
function createMockModel<T extends string>(api: T): Model<any> {
	return {
		id: `${api}-model`,
		name: `Test ${api} Model`,
		api,
		baseUrl: `https://api.${api}.com`,
		reasoning: false,
		input: ["text"],
		cost: { input: 1, output: 2, cacheRead: 0.5, cacheWrite: 1.5 },
		contextWindow: 100000,
		maxTokens: 4096,
		tools: ["function_calling"],
	};
}

// Helper to create mock context
function createMockContext(): Context {
	return {
		messages: [{ role: "user", id: "msg-1", content: [{ type: "text", content: "Hello" }] }],
		systemPrompt: "You are a helpful assistant",
		tools: [],
	};
}

// Helper to create mock response
function createMockResponse(api: string): BaseAssistantMessage<any> {
	return {
		role: "assistant",
		id: "response-1",
		api,
		model: createMockModel(api),
		message: {},
		content: [{ type: "response", content: [{ type: "text", content: "Hello!" }] }],
		usage: {
			input: 10,
			output: 5,
			cacheRead: 0,
			cacheWrite: 0,
			totalTokens: 15,
			cost: { input: 0.01, output: 0.01, cacheRead: 0, cacheWrite: 0, total: 0.02 },
		},
		stopReason: "stop",
		timestamp: Date.now(),
		duration: 100,
	};
}

describe("complete", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("provider dispatch", () => {
		it("should dispatch to Anthropic provider", async () => {
			const model = createMockModel("anthropic");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockResponse = createMockResponse("anthropic");

			vi.mocked(completeAnthropic).mockResolvedValue(mockResponse);

			const result = await complete(model, context, options, "req-1");

			expect(completeAnthropic).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockResponse);
		});

		it("should dispatch to OpenAI provider", async () => {
			const model = createMockModel("openai");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockResponse = createMockResponse("openai");

			vi.mocked(completeOpenAI).mockResolvedValue(mockResponse);

			const result = await complete(model, context, options, "req-1");

			expect(completeOpenAI).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockResponse);
		});

		it("should dispatch to Google provider", async () => {
			const model = createMockModel("google");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockResponse = createMockResponse("google");

			vi.mocked(completeGoogle).mockResolvedValue(mockResponse);

			const result = await complete(model, context, options, "req-1");

			expect(completeGoogle).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockResponse);
		});

		it("should dispatch to DeepSeek provider", async () => {
			const model = createMockModel("deepseek");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockResponse = createMockResponse("deepseek");

			vi.mocked(completeDeepSeek).mockResolvedValue(mockResponse);

			const result = await complete(model, context, options, "req-1");

			expect(completeDeepSeek).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockResponse);
		});

		it("should dispatch to Zai provider", async () => {
			const model = createMockModel("zai");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockResponse = createMockResponse("zai");

			vi.mocked(completeZai).mockResolvedValue(mockResponse);

			const result = await complete(model, context, options, "req-1");

			expect(completeZai).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockResponse);
		});

		it("should dispatch to Kimi provider", async () => {
			const model = createMockModel("kimi");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockResponse = createMockResponse("kimi");

			vi.mocked(completeKimi).mockResolvedValue(mockResponse);

			const result = await complete(model, context, options, "req-1");

			expect(completeKimi).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockResponse);
		});

	});

	describe("error handling", () => {
		it("should propagate provider errors", async () => {
			const model = createMockModel("anthropic");
			const context = createMockContext();
			const options = { apiKey: "test-key" };

			vi.mocked(completeAnthropic).mockRejectedValue(new Error("API rate limited"));

			await expect(complete(model, context, options, "req-1")).rejects.toThrow("API rate limited");
		});
	});

	describe("context and options forwarding", () => {
		it("should forward all context fields", async () => {
			const model = createMockModel("anthropic");
			const context: Context = {
				messages: [
					{ role: "user", id: "msg-1", content: [{ type: "text", content: "Hello" }] },
					{
						role: "toolResult",
						id: "msg-2",
						toolName: "calculator",
						toolCallId: "call-1",
						content: [{ type: "text", content: "42" }],
						isError: false,
						timestamp: Date.now(),
					},
				],
				systemPrompt: "Be helpful",
				tools: [{ name: "calculator", description: "Does math", parameters: {} as any }],
			};
			const options = { apiKey: "test-key", max_tokens: 1000 };

			vi.mocked(completeAnthropic).mockResolvedValue(createMockResponse("anthropic"));

			await complete(model, context, options, "req-1");

			expect(completeAnthropic).toHaveBeenCalledWith(model, context, options, "req-1");
		});
	});
});
