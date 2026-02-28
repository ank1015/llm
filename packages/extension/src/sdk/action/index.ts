export { summarizeActionDomChanges } from './diff.js';
export type { ActionDomDiffSummary } from './diff.js';
export {
  OBSERVE_BEFORE_ACT_MESSAGE,
  buildSelectorCandidates,
  resolveObservedTarget,
} from './helpers.js';
export { buildActionScript, parseActionExecutionResult } from './script.js';
export type {
  WindowActionScriptPayload,
  WindowActionExecutionResult,
  WindowActionOptions,
  WindowObservedActionTarget,
  WindowScrollBehavior,
  WindowScrollOptions,
  WindowTargetActionType,
  WindowTypeOptions,
} from './types.js';
