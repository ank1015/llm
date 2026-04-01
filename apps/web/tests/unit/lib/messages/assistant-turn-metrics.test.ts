import { describe, expect, it } from "vitest";

import { getAssistantTurnMetrics } from "@/lib/messages/assistant-turn-metrics";

import type { BaseAssistantMessage, Message } from "@ank1015/llm-sdk";

function createAssistantMessage(input: {
  id: string;
  totalTokens: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheRead?: number;
  cacheWrite?: number;
  actualCost: number;
  contextWindow: number;
  pricing?: {
    input: number;
    output: number;
    cacheRead: number;
    cacheWrite: number;
  };
}): BaseAssistantMessage<"codex"> {
  return {
    role: "assistant",
    id: input.id,
    api: "codex",
    model: {
      id: "gpt-5.4",
      api: "codex",
      name: "GPT-5.4",
      baseUrl: "https://example.com",
      reasoning: true,
      input: ["text"],
      cost: input.pricing ?? {
        input: 1,
        output: 2,
        cacheRead: 0.2,
        cacheWrite: 0.5,
      },
      contextWindow: input.contextWindow,
      maxTokens: 4096,
      tools: [],
    },
    timestamp: Date.now(),
    duration: 100,
    stopReason: "stop",
    content: [],
    usage: {
      input: input.inputTokens ?? 0,
      output: input.outputTokens ?? 0,
      cacheRead: input.cacheRead ?? 0,
      cacheWrite: input.cacheWrite ?? 0,
      totalTokens: input.totalTokens,
      cost: {
        input: 0,
        output: 0,
        cacheRead: 0,
        cacheWrite: 0,
        total: input.actualCost,
      },
    },
    message: {} as BaseAssistantMessage<"codex">["message"],
  };
}

describe("getAssistantTurnMetrics", () => {
  it("derives context usage, actual cost, and cache hit percent for a single assistant turn", () => {
    const assistant = createAssistantMessage({
      id: "assistant-1",
      totalTokens: 3000,
      inputTokens: 1000,
      outputTokens: 500,
      cacheRead: 500,
      cacheWrite: 0,
      actualCost: 0.0016,
      contextWindow: 10000,
    });

    const metrics = getAssistantTurnMetrics({
      cotMessages: [],
      assistantMessage: assistant,
    });

    expect(metrics.contextTotalTokens).toBe(3000);
    expect(metrics.contextWindow).toBe(10000);
    expect(metrics.contextUtilization).toBe(0.3);
    expect(metrics.actualCost).toBeCloseTo(0.0016, 8);
    expect(metrics.noCacheCost).toBeCloseTo(0.0025, 8);
    expect(metrics.cacheHitPercent).toBeCloseTo(1 - 0.0016 / 0.0025, 8);
  });

  it("sums multiple assistant messages in the same turn and falls back to the latest positive token usage", () => {
    const toolAssistant = createAssistantMessage({
      id: "assistant-tool",
      totalTokens: 1200,
      inputTokens: 600,
      outputTokens: 200,
      cacheRead: 200,
      actualCost: 0.001,
      contextWindow: 8000,
    });
    const finalAssistant = createAssistantMessage({
      id: "assistant-final",
      totalTokens: 0,
      inputTokens: 500,
      outputTokens: 300,
      cacheRead: 100,
      actualCost: 0.0009,
      contextWindow: 8000,
    });

    const metrics = getAssistantTurnMetrics({
      cotMessages: [toolAssistant as Message],
      assistantMessage: finalAssistant,
    });

    expect(metrics.contextTotalTokens).toBe(1200);
    expect(metrics.contextWindow).toBe(8000);
    expect(metrics.actualCost).toBeCloseTo(0.0019, 8);
    expect(metrics.noCacheCost).toBeCloseTo(0.0024, 8);
  });

  it("clamps cache hit percent at zero when actual cost exceeds uncached baseline", () => {
    const assistant = createAssistantMessage({
      id: "assistant-1",
      totalTokens: 1500,
      inputTokens: 100,
      outputTokens: 100,
      cacheRead: 0,
      cacheWrite: 0,
      actualCost: 0.01,
      contextWindow: 10000,
      pricing: {
        input: 1,
        output: 1,
        cacheRead: 0,
        cacheWrite: 0,
      },
    });

    const metrics = getAssistantTurnMetrics({
      cotMessages: [],
      assistantMessage: assistant,
    });

    expect(metrics.noCacheCost).toBeCloseTo(0.0002, 8);
    expect(metrics.cacheHitPercent).toBe(0);
  });

  it("hides metrics cleanly when assistant data is missing", () => {
    const metrics = getAssistantTurnMetrics({
      cotMessages: [],
      assistantMessage: null,
    });

    expect(metrics).toEqual({
      contextTotalTokens: null,
      contextWindow: null,
      contextUtilization: null,
      actualCost: null,
      noCacheCost: null,
      cacheHitPercent: null,
    });
  });
});
