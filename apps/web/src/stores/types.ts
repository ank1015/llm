import type { Api, CuratedModelId, ReasoningEffort } from "@ank1015/llm-sdk";
import type { SessionMessageNode } from "@ank1015/llm-sdk/session";

import type { MessageNode } from "@/lib/messages/session-tree";

export type SessionRef = {
  sessionId: string;
};

export type ChatExecutionSettings = {
  api: Api;
  modelId: CuratedModelId;
  reasoningEffort: ReasoningEffort;
};

export type ChatSelectionInput = {
  api?: Api;
  modelId: CuratedModelId;
};

export type PersistedSessionMessageNode = SessionMessageNode;
export type { MessageNode };
