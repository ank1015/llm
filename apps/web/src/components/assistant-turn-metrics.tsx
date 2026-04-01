"use client";

import { useMemo } from "react";

import type { AssistantTurnMetrics } from "@/lib/messages/assistant-turn-metrics";

const ICON_SIZE = 16;
const STROKE_WIDTH = 2;
const RADIUS = (ICON_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TRACK_COLOR = "var(--muted-foreground)";
const DEFAULT_STROKE_COLOR = "var(--foreground)";

const tokenFormatter = new Intl.NumberFormat("en-US");
const percentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});
const compactPercentFormatter = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

function getStrokeColor(utilization: number): string {
  if (utilization >= 0.85) {
    return "rgb(248 113 113)";
  }

  if (utilization >= 0.6) {
    return "rgb(251 191 36)";
  }

  return DEFAULT_STROKE_COLOR;
}

function formatUsdCost(value: number): string {
  if (value >= 0.1) {
    return `$${value.toFixed(2)}`;
  }

  if (value >= 0.01) {
    return `$${value.toFixed(3)}`;
  }

  return `$${value.toFixed(4)}`;
}

function ContextUsageRing({ metrics }: { metrics: AssistantTurnMetrics }) {
  const usage = useMemo(() => {
    if (
      metrics.contextTotalTokens === null ||
      metrics.contextWindow === null ||
      metrics.contextUtilization === null ||
      metrics.contextWindow <= 0
    ) {
      return null;
    }

    const rawUtilization = metrics.contextUtilization;
    const clampedUtilization = Math.max(0, Math.min(rawUtilization, 1));

    return {
      usedTokensLabel: tokenFormatter.format(metrics.contextTotalTokens),
      contextWindowLabel: tokenFormatter.format(metrics.contextWindow),
      percentUsedLabel: percentFormatter.format(rawUtilization * 100),
      strokeColor: getStrokeColor(rawUtilization),
      strokeDasharray: `${clampedUtilization * CIRCUMFERENCE} ${CIRCUMFERENCE}`,
    };
  }, [metrics]);

  if (!usage) {
    return null;
  }

  return (
    <div className="group/context relative inline-flex">
      <button
        type="button"
        className="text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center rounded-md transition-colors"
        aria-label={`Context usage: ${usage.usedTokensLabel} tokens, ${usage.percentUsedLabel}% used`}
      >
        <svg
          viewBox={`0 0 ${ICON_SIZE} ${ICON_SIZE}`}
          className="size-3.5 -rotate-90"
          aria-hidden="true"
        >
          <circle
            cx={ICON_SIZE / 2}
            cy={ICON_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={TRACK_COLOR}
            strokeOpacity={0.35}
            strokeWidth={STROKE_WIDTH}
          />
          <circle
            cx={ICON_SIZE / 2}
            cy={ICON_SIZE / 2}
            r={RADIUS}
            fill="none"
            stroke={usage.strokeColor}
            strokeWidth={STROKE_WIDTH}
            strokeDasharray={usage.strokeDasharray}
            strokeLinecap="round"
          />
        </svg>
      </button>

      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-black/8 bg-white px-2.5 py-1.5 text-[11px] leading-4 text-black shadow-xs group-hover/context:block dark:border-white/10 dark:bg-[#161616] dark:text-white">
        <div className="flex flex-col gap-0.5">
          <span>{usage.usedTokensLabel} tokens used</span>
          <span className="opacity-75">
            {usage.percentUsedLabel}% of {usage.contextWindowLabel}
          </span>
        </div>
      </div>
    </div>
  );
}

function TurnCostLabel({ metrics }: { metrics: AssistantTurnMetrics }) {
  if (metrics.actualCost === null) {
    return null;
  }

  return (
    <div className="group/cost relative inline-flex">
      <span className="text-muted-foreground text-[12px] font-medium tabular-nums">
        {formatUsdCost(metrics.actualCost)}
      </span>

      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-black/8 bg-white px-2.5 py-1.5 text-[11px] leading-4 text-black shadow-xs group-hover/cost:block dark:border-white/10 dark:bg-[#161616] dark:text-white">
        Total Cost
      </div>
    </div>
  );
}

function CacheHitLabel({ metrics }: { metrics: AssistantTurnMetrics }) {
  if (metrics.cacheHitPercent === null) {
    return null;
  }

  return (
    <div className="group/cache relative inline-flex">
      <span className="text-muted-foreground text-[12px] font-medium tabular-nums">
        {compactPercentFormatter.format(metrics.cacheHitPercent * 100)}%
      </span>

      <div className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded-md border border-black/8 bg-white px-2.5 py-1.5 text-[11px] leading-4 text-black shadow-xs group-hover/cache:block dark:border-white/10 dark:bg-[#161616] dark:text-white">
        Cache
      </div>
    </div>
  );
}

export function AssistantTurnMetricsInline({
  metrics,
}: {
  metrics: AssistantTurnMetrics;
}) {
  return (
    <>
      <ContextUsageRing metrics={metrics} />
      <TurnCostLabel metrics={metrics} />
      <CacheHitLabel metrics={metrics} />
    </>
  );
}
