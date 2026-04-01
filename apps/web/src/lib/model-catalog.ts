"use client";

import type { Api, CuratedModelId, ReasoningEffort } from "@ank1015/llm-sdk";

export const CURATED_MODEL_IDS = [
  "openai/gpt-5.4",
  "openai/gpt-5.3-codex",
  "openai/gpt-5.4-pro",
  "openai/gpt-5.4-mini",
  "openai/gpt-5.4-nano",
  "codex/gpt-5.4",
  "codex/gpt-5.4-mini",
  "codex/gpt-5.3-codex",
  "codex/gpt-5.3-codex-spark",
  "anthropic/claude-opus-4-6",
  "anthropic/claude-sonnet-4-6",
  "claude-code/claude-opus-4-6",
  "claude-code/claude-sonnet-4-6",
  "google/gemini-3.1-pro-preview",
  "google/gemini-3-flash-preview",
  "google/gemini-3.1-flash-lite-preview",
] as const satisfies readonly CuratedModelId[];

export const REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
] as const satisfies readonly ReasoningEffort[];

export const PROVIDER_LABELS: Partial<Record<Api, string>> = {
  openai: "OpenAI",
  codex: "Codex",
  anthropic: "Claude",
  "claude-code": "Claude Code",
  google: "Gemini",
};

export function getApiForModelId(modelId: CuratedModelId): Api {
  const [provider] = modelId.split("/");
  return provider as Api;
}

export function getShortModelId(modelId: CuratedModelId): string {
  return modelId.split("/")[1] ?? modelId;
}

export function formatChatModelLabel(modelId: CuratedModelId): string {
  const api = getApiForModelId(modelId);
  return `${PROVIDER_LABELS[api] ?? api} / ${getShortModelId(modelId)}`;
}
