import type { ObserveLocator } from '../observe/types.js';

export interface WindowActionOptions {
  tabId?: number;
  timeoutMs?: number;
}

export interface WindowTypeOptions extends WindowActionOptions {
  clearBeforeType?: boolean;
  pressEnter?: boolean;
}

export type WindowScrollBehavior = 'auto' | 'smooth';

export interface WindowScrollOptions extends WindowActionOptions {
  targetId?: string;
  x?: number;
  y?: number;
  to?: 'top' | 'bottom' | 'left' | 'right';
  behavior?: WindowScrollBehavior;
}

export type WindowTargetActionType =
  | 'click'
  | 'hover'
  | 'focus'
  | 'pressEnter'
  | 'clear'
  | 'type'
  | 'select'
  | 'toggle';

export interface WindowObservedActionTarget {
  id: string;
  tag: string;
  role: string;
  name: string;
  href?: string;
  locator: ObserveLocator;
  actions: string[];
}

export interface WindowActionScriptPayload {
  action: WindowTargetActionType | 'scroll';
  selectors: string[];
  value?: string;
  clearBeforeType?: boolean;
  pressEnter?: boolean;
  scroll?: {
    x?: number;
    y?: number;
    to?: 'top' | 'bottom' | 'left' | 'right';
    behavior?: WindowScrollBehavior;
  };
}

export interface WindowActionExecutionResult {
  success: boolean;
  action: string;
  message: string;
  selectorUsed?: string;
}
