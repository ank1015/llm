import { stream } from '../llm/stream.js';
import { generateUUID } from '../utils/uuid.js';

import type {
  AgentModelInvocation,
  AgentModelInvoker,
  Api,
  OptionsForApi,
  WithOptionalKey,
} from '../types/index.js';

/**
 * Default model invoker used by the agent engine.
 *
 * It always uses the provider streaming path so callers can receive updates
 * through `onUpdate`, while still returning the final assembled message.
 */
export const defaultModelInvoker: AgentModelInvoker = async <TApi extends Api>({
  model,
  context,
  options,
  signal,
  onUpdate,
  messageId,
}: AgentModelInvocation<TApi>) => {
  const id = messageId ?? generateUUID();
  const providerOptions = { ...options, signal } as WithOptionalKey<OptionsForApi<TApi>>;
  const assistantStream = stream(
    model,
    context,
    providerOptions as OptionsForApi<TApi>,
    id
  );

  for await (const event of assistantStream) {
    if (onUpdate) {
      try {
        onUpdate(event);
      } catch {
        // Observation callbacks must not affect model execution.
      }
    }
  }

  return assistantStream.result();
};
