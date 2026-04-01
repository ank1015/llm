import type { Api, BaseAssistantMessage, Message } from "@ank1015/llm-sdk";

export type AssistantTurnMetrics = {
  contextTotalTokens: number | null;
  contextWindow: number | null;
  contextUtilization: number | null;
  actualCost: number | null;
  noCacheCost: number | null;
  cacheHitPercent: number | null;
};

type AssistantLikeMessage = Message | Omit<BaseAssistantMessage<Api>, "message">;

function isAssistantMessage(
  message: AssistantLikeMessage | null | undefined,
): message is Extract<AssistantLikeMessage, { role: "assistant" }> {
  return message?.role === "assistant";
}

function getAssistantMessages(messages: AssistantLikeMessage[]): BaseAssistantMessage<Api>[] {
  return messages.filter(isAssistantMessage) as BaseAssistantMessage<Api>[];
}

function getPositiveTotalTokens(message: BaseAssistantMessage<Api>): number {
  const totalTokens = message.usage?.totalTokens ?? 0;
  return Number.isFinite(totalTokens) && totalTokens > 0 ? totalTokens : 0;
}

function getContextSourceMessage(
  assistantMessages: BaseAssistantMessage<Api>[],
): BaseAssistantMessage<Api> | null {
  const finalAssistant = assistantMessages[assistantMessages.length - 1] ?? null;
  if (finalAssistant && getPositiveTotalTokens(finalAssistant) > 0) {
    return finalAssistant;
  }

  for (let index = assistantMessages.length - 1; index >= 0; index -= 1) {
    const candidate = assistantMessages[index];
    if (candidate && getPositiveTotalTokens(candidate) > 0) {
      return candidate;
    }
  }

  return finalAssistant;
}

function getNumber(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function getActualTurnCost(assistantMessages: BaseAssistantMessage<Api>[]): number {
  return assistantMessages.reduce((sum, message) => {
    return sum + getNumber(message.usage?.cost?.total);
  }, 0);
}

function getNoCacheCostForMessage(message: BaseAssistantMessage<Api>): number | null {
  const modelCost = message.model?.cost;
  if (!modelCost) {
    return null;
  }

  const inputTokens =
    getNumber(message.usage?.input) + getNumber(message.usage?.cacheRead) + getNumber(message.usage?.cacheWrite);
  const outputTokens = getNumber(message.usage?.output);

  const inputCost = (getNumber(modelCost.input) / 1_000_000) * inputTokens;
  const outputCost = (getNumber(modelCost.output) / 1_000_000) * outputTokens;

  return inputCost + outputCost;
}

function getNoCacheTurnCost(assistantMessages: BaseAssistantMessage<Api>[]): number | null {
  let hasAny = false;
  let total = 0;

  for (const message of assistantMessages) {
    const messageCost = getNoCacheCostForMessage(message);
    if (messageCost === null) {
      continue;
    }

    hasAny = true;
    total += messageCost;
  }

  return hasAny ? total : null;
}

export function getAssistantTurnMetrics(input: {
  cotMessages: AssistantLikeMessage[];
  assistantMessage: BaseAssistantMessage<Api> | null;
}): AssistantTurnMetrics {
  const assistantMessages = getAssistantMessages([
    ...input.cotMessages,
    ...(input.assistantMessage ? [input.assistantMessage] : []),
  ]);

  if (assistantMessages.length === 0) {
    return {
      contextTotalTokens: null,
      contextWindow: null,
      contextUtilization: null,
      actualCost: null,
      noCacheCost: null,
      cacheHitPercent: null,
    };
  }

  const contextSource = getContextSourceMessage(assistantMessages);
  const contextTotalTokens = contextSource ? getPositiveTotalTokens(contextSource) : 0;
  const contextWindow =
    contextSource && getNumber(contextSource.model?.contextWindow) > 0
      ? getNumber(contextSource.model.contextWindow)
      : 0;

  const actualCost = getActualTurnCost(assistantMessages);
  const noCacheCost = getNoCacheTurnCost(assistantMessages);
  const cacheHitPercent =
    noCacheCost && noCacheCost > 0
      ? Math.max(0, Math.min(1, 1 - actualCost / noCacheCost))
      : null;

  return {
    contextTotalTokens: contextTotalTokens > 0 ? contextTotalTokens : null,
    contextWindow: contextWindow > 0 ? contextWindow : null,
    contextUtilization:
      contextTotalTokens > 0 && contextWindow > 0 ? contextTotalTokens / contextWindow : null,
    actualCost: actualCost > 0 ? actualCost : null,
    noCacheCost,
    cacheHitPercent,
  };
}
