import { readLatestObserveSnapshot } from '../observe/storage.js';

import type { WindowObservedActionTarget } from './types.js';
import type { ObserveInteractiveElement } from '../observe/types.js';

export const OBSERVE_BEFORE_ACT_MESSAGE = 'You must observe before act';

export interface ResolveObservedTargetInput {
  windowId: number;
  tabId: number;
  targetId: string;
}

export interface ResolveObservedTargetSuccess {
  status: 'ok';
  target: WindowObservedActionTarget;
}

export interface ResolveObservedTargetMissingObserve {
  status: 'observe_required';
  message: string;
}

export interface ResolveObservedTargetNotFound {
  status: 'target_not_found';
  message: string;
}

export type ResolveObservedTargetResult =
  | ResolveObservedTargetSuccess
  | ResolveObservedTargetMissingObserve
  | ResolveObservedTargetNotFound;

export async function resolveObservedTarget(
  input: ResolveObservedTargetInput
): Promise<ResolveObservedTargetResult> {
  const record = await readLatestObserveSnapshot(input.windowId, input.tabId);
  if (!record) {
    return {
      status: 'observe_required',
      message: OBSERVE_BEFORE_ACT_MESSAGE,
    };
  }

  const target = findTarget(record.snapshot.interactive, input.targetId);
  if (!target) {
    return {
      status: 'target_not_found',
      message: `Target "${input.targetId}" was not found in latest observe snapshot for tab ${input.tabId}`,
    };
  }

  const normalizedTarget: WindowObservedActionTarget = {
    id: target.id,
    tag: target.tag,
    role: target.role,
    name: target.name,
    locator: target.locator,
    actions: target.actions,
  };

  if (target.href) {
    normalizedTarget.href = target.href;
  }

  return {
    status: 'ok',
    target: normalizedTarget,
  };
}

function findTarget(
  interactive: ObserveInteractiveElement[],
  targetId: string
): ObserveInteractiveElement | null {
  const normalized = targetId.trim().toUpperCase();
  if (!normalized) {
    return null;
  }

  return interactive.find((item) => item.id.toUpperCase() === normalized) ?? null;
}

function escapeForAttribute(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

export function buildSelectorCandidates(target: WindowObservedActionTarget): string[] {
  const selectors: string[] = [];

  const add = (selector: string | undefined): void => {
    if (!selector) return;
    const trimmed = selector.trim();
    if (!trimmed) return;
    if (!selectors.includes(trimmed)) {
      selectors.push(trimmed);
    }
  };

  if (target.locator.cssPath) {
    add(target.locator.cssPath);
  }

  if (target.locator.id) {
    const idEscaped = escapeForAttribute(target.locator.id);
    add(`#${idEscaped}`);
    add(`${target.tag}#${idEscaped}`);
    add(`[id="${idEscaped}"]`);
  }

  if (target.locator.testId) {
    const testIdEscaped = escapeForAttribute(target.locator.testId);
    add(`[data-testid="${testIdEscaped}"]`);
    add(`[data-test-id="${testIdEscaped}"]`);
    add(`[data-test="${testIdEscaped}"]`);
    add(`[data-qa="${testIdEscaped}"]`);
  }

  if (target.locator.name) {
    const nameEscaped = escapeForAttribute(target.locator.name);
    add(`${target.tag}[name="${nameEscaped}"]`);
    add(`[name="${nameEscaped}"]`);
  }

  if (target.href) {
    const hrefEscaped = escapeForAttribute(target.href);
    add(`a[href="${hrefEscaped}"]`);
    add(`a[href*="${hrefEscaped}"]`);
  }

  if (target.role && target.name) {
    const roleEscaped = escapeForAttribute(target.role);
    add(`${target.tag}[role="${roleEscaped}"]`);
    add(`[role="${roleEscaped}"]`);
  } else if (target.role) {
    const roleEscaped = escapeForAttribute(target.role);
    add(`[role="${roleEscaped}"]`);
  }

  return selectors;
}
