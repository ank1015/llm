import type { Context, Model } from "@ank1015/llm-types";
import { EventStream, AssistantMessageEventStream } from "../../../src/utils/event-stream.js";
import { beforeEach, describe, expect, it, vi } from "vitest";

// Mock all provider stream functions
vi.mock("../../../src/providers/anthropic/stream.js", () => ({
	streamAnthropic: vi.fn(),
}));
vi.mock("../../../src/providers/openai/stream.js", () => ({
	streamOpenAI: vi.fn(),
}));
vi.mock("../../../src/providers/google/stream.js", () => ({
	streamGoogle: vi.fn(),
}));
vi.mock("../../../src/providers/deepseek/stream.js", () => ({
	streamDeepSeek: vi.fn(),
}));
vi.mock("../../../src/providers/zai/stream.js", () => ({
	streamZai: vi.fn(),
}));
vi.mock("../../../src/providers/kimi/stream.js", () => ({
	streamKimi: vi.fn(),
}));

import { stream } from "../../../src/llm/stream.js";
import { streamAnthropic } from "../../../src/providers/anthropic/stream.js";
import { streamDeepSeek } from "../../../src/providers/deepseek/stream.js";
import { streamGoogle } from "../../../src/providers/google/stream.js";
import { streamKimi } from "../../../src/providers/kimi/stream.js";
import { streamOpenAI } from "../../../src/providers/openai/stream.js";
import { streamZai } from "../../../src/providers/zai/stream.js";

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

// Helper to create mock event stream
function createMockEventStream(): AssistantMessageEventStream<any> {
	return new EventStream() as AssistantMessageEventStream<any>;
}

describe("stream", () => {
	beforeEach(() => {
		vi.clearAllMocks();
	});

	describe("provider dispatch", () => {
		it("should dispatch to Anthropic provider", () => {
			const model = createMockModel("anthropic");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockStream = createMockEventStream();

			vi.mocked(streamAnthropic).mockReturnValue(mockStream);

			const result = stream(model, context, options, "req-1");

			expect(streamAnthropic).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockStream);
		});

		it("should dispatch to OpenAI provider", () => {
			const model = createMockModel("openai");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockStream = createMockEventStream();

			vi.mocked(streamOpenAI).mockReturnValue(mockStream);

			const result = stream(model, context, options, "req-1");

			expect(streamOpenAI).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockStream);
		});

		it("should dispatch to Google provider", () => {
			const model = createMockModel("google");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockStream = createMockEventStream();

			vi.mocked(streamGoogle).mockReturnValue(mockStream);

			const result = stream(model, context, options, "req-1");

			expect(streamGoogle).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockStream);
		});

		it("should dispatch to DeepSeek provider", () => {
			const model = createMockModel("deepseek");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockStream = createMockEventStream();

			vi.mocked(streamDeepSeek).mockReturnValue(mockStream);

			const result = stream(model, context, options, "req-1");

			expect(streamDeepSeek).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockStream);
		});

		it("should dispatch to Zai provider", () => {
			const model = createMockModel("zai");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockStream = createMockEventStream();

			vi.mocked(streamZai).mockReturnValue(mockStream);

			const result = stream(model, context, options, "req-1");

			expect(streamZai).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockStream);
		});

		it("should dispatch to Kimi provider", () => {
			const model = createMockModel("kimi");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockStream = createMockEventStream();

			vi.mocked(streamKimi).mockReturnValue(mockStream);

			const result = stream(model, context, options, "req-1");

			expect(streamKimi).toHaveBeenCalledWith(model, context, options, "req-1");
			expect(result).toBe(mockStream);
		});
	});

	describe("stream returns correct type", () => {
		it("should return an event stream that can be iterated", async () => {
			const model = createMockModel("anthropic");
			const context = createMockContext();
			const options = { apiKey: "test-key" };
			const mockStream = createMockEventStream();

			vi.mocked(streamAnthropic).mockReturnValue(mockStream);

			const result = stream(model, context, options, "req-1");

			// Verify the stream is iterable
			expect(result[Symbol.asyncIterator]).toBeDefined();
			expect(typeof result.result).toBe("function");
		});
	});
});
