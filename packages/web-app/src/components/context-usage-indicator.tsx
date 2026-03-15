'use client';

import { getModel } from '@ank1015/llm-core';
import { useMemo } from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useChatSettingsStore } from '@/stores/chat-settings-store';

const ICON_SIZE = 16;
const STROKE_WIDTH = 2;
const RADIUS = (ICON_SIZE - STROKE_WIDTH) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const TRACK_COLOR = 'var(--muted-foreground)';
const DEFAULT_STROKE_COLOR = 'var(--foreground)';

const tokenFormatter = new Intl.NumberFormat('en-US');
const percentFormatter = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 1,
  minimumFractionDigits: 0,
});

function getStrokeColor(utilization: number): string {
  if (utilization >= 0.85) {
    return 'rgb(248 113 113)';
  }

  if (utilization >= 0.6) {
    return 'rgb(251 191 36)';
  }

  return DEFAULT_STROKE_COLOR;
}

type ContextUsageIndicatorProps = {
  totalTokens: number;
};

export function ContextUsageIndicator({ totalTokens }: ContextUsageIndicatorProps) {
  const api = useChatSettingsStore((state) => state.api);
  const modelId = useChatSettingsStore((state) => state.modelId);

  const selectedModel = useMemo(() => getModel(api, modelId as never), [api, modelId]);

  const usage = useMemo(() => {
    if (!selectedModel || selectedModel.contextWindow <= 0 || totalTokens <= 0) {
      return null;
    }

    const rawUtilization = totalTokens / selectedModel.contextWindow;
    const clampedUtilization = Math.max(0, Math.min(rawUtilization, 1));

    return {
      contextWindow: selectedModel.contextWindow,
      rawUtilization,
      strokeColor: getStrokeColor(rawUtilization),
      strokeDasharray: `${clampedUtilization * CIRCUMFERENCE} ${CIRCUMFERENCE}`,
    };
  }, [selectedModel, totalTokens]);

  if (!usage) {
    return null;
  }

  const usedTokensLabel = tokenFormatter.format(totalTokens);
  const contextWindowLabel = tokenFormatter.format(usage.contextWindow);
  const percentUsedLabel = percentFormatter.format(usage.rawUtilization * 100);

  return (
    <Tooltip delayDuration={120}>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="text-muted-foreground hover:text-foreground inline-flex size-5 items-center justify-center rounded-md transition-colors"
          aria-label={`Context usage: ${usedTokensLabel} tokens, ${percentUsedLabel}% used`}
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
      </TooltipTrigger>
      <TooltipContent
        side="top"
        className="border-border bg-popover text-popover-foreground shadow-xs border [&_svg]:fill-popover [&_svg]:bg-popover"
      >
        <div className="flex flex-col gap-0.5">
          <span>{usedTokensLabel} tokens used</span>
          <span className="opacity-75">
            {percentUsedLabel}% of {contextWindowLabel}
          </span>
        </div>
      </TooltipContent>
    </Tooltip>
  );
}
