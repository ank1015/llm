import type { ObserveSnapshot } from '../observe/types.js';

export interface ActionDomDiffSummary {
  hasChanges: boolean;
  lines: string[];
}

function normalizeText(value: string, max = 120): string {
  const compact = value.replace(/\s+/g, ' ').trim();
  if (compact.length <= max) {
    return compact;
  }
  return `${compact.slice(0, Math.max(1, max - 3))}...`;
}

function diffStrings(before: string[], after: string[]): string[] {
  const beforeSet = new Set(before.map((item) => item.trim()).filter(Boolean));
  const result: string[] = [];

  for (const item of after) {
    const normalized = item.trim();
    if (!normalized || beforeSet.has(normalized)) {
      continue;
    }
    result.push(normalized);
  }

  return result;
}

export function summarizeActionDomChanges(
  before: ObserveSnapshot,
  after: ObserveSnapshot
): ActionDomDiffSummary {
  const lines: string[] = [];

  if (before.page.title !== after.page.title) {
    lines.push(`- Title changed to: ${after.page.title || '(untitled)'}`);
  }

  if (before.summary.totalLinks !== after.summary.totalLinks) {
    lines.push(`- Links count: ${before.summary.totalLinks} -> ${after.summary.totalLinks}`);
  }

  if (before.summary.totalButtons !== after.summary.totalButtons) {
    lines.push(`- Buttons count: ${before.summary.totalButtons} -> ${after.summary.totalButtons}`);
  }

  if (before.summary.totalInputs !== after.summary.totalInputs) {
    lines.push(`- Inputs count: ${before.summary.totalInputs} -> ${after.summary.totalInputs}`);
  }

  const newAlerts = diffStrings(before.alerts, after.alerts);
  if (newAlerts.length > 0) {
    const sample = newAlerts
      .slice(0, 2)
      .map((item) => `"${normalizeText(item)}"`)
      .join(', ');
    const suffix = newAlerts.length > 2 ? `, +${newAlerts.length - 2} more` : '';
    lines.push(`- New alerts: ${sample}${suffix}`);
  }

  if (lines.length === 0) {
    return {
      hasChanges: false,
      lines: ['- No broad page structure changes detected.'],
    };
  }

  return {
    hasChanges: true,
    lines: lines.slice(0, 4),
  };
}
