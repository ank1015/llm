import { sanitizeForStorage } from './sanitize.js';

import type { GatewayLogMode } from '../config.js';
import type { GatewayDatabase, RequestKind } from '../db/index.js';
import type { ImageUsage, Usage } from '@ank1015/llm-core';

type UsageLike = Usage | ImageUsage;

export interface RequestLog {
  appendEvent(requestId: string, seq: number, event: unknown): void;
  completeRequest(input: {
    requestId: string;
    status: 'aborted' | 'error' | 'ok';
    errorCode?: string | null;
    errorMessage?: string | null;
    output?: unknown | undefined;
    usage?: UsageLike | undefined;
  }): void;
  startRequest(input: {
    requestId: string;
    clientRequestId?: string | undefined;
    senderId: string;
    kind: RequestKind;
    api: string;
    modelId: string;
    input: unknown;
  }): void;
}

export function createRequestLog(
  db: GatewayDatabase,
  logMode: GatewayLogMode,
  logEvents: boolean
): RequestLog {
  return {
    appendEvent(requestId, seq, event) {
      if (logMode !== 'full' || !logEvents) {
        return;
      }

      db.insertRequestEvent({
        requestId,
        seq,
        timestamp: Date.now(),
        eventJson: JSON.stringify(sanitizeForStorage(event)),
      });
    },
    completeRequest(input) {
      const usage = extractUsageFields(input.usage);

      db.completeRequest({
        id: input.requestId,
        status: input.status,
        errorCode: input.errorCode ?? null,
        errorMessage: input.errorMessage ?? null,
        inputTokens: usage?.inputTokens ?? null,
        outputTokens: usage?.outputTokens ?? null,
        totalTokens: usage?.totalTokens ?? null,
        costUsd: usage?.costUsd ?? null,
        outputJson:
          logMode === 'full' && input.output !== undefined
            ? JSON.stringify(sanitizeForStorage(input.output))
            : null,
      });
    },
    startRequest(input) {
      db.insertRequest({
        id: input.requestId,
        ...(input.clientRequestId !== undefined ? { clientRequestId: input.clientRequestId } : {}),
        senderId: input.senderId,
        kind: input.kind,
        api: input.api,
        modelId: input.modelId,
        inputJson: logMode === 'full' ? JSON.stringify(sanitizeForStorage(input.input)) : null,
      });
    },
  };
}

function extractUsageFields(
  usage: UsageLike | undefined
): { costUsd: number; inputTokens: number; outputTokens: number; totalTokens: number } | undefined {
  if (!usage) {
    return undefined;
  }

  return {
    inputTokens: usage.input,
    outputTokens: usage.output,
    totalTokens: usage.totalTokens,
    costUsd: usage.cost.total,
  };
}
