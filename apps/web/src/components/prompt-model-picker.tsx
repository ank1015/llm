"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import type { Api, CuratedModelId } from "@ank1015/llm-sdk";

import { useModelsQuery } from "@/hooks/api";
import { PROVIDER_LABELS, getShortModelId } from "@/lib/model-catalog";
import { CHAT_MODEL_OPTIONS, useChatSettingsStore } from "@/stores/chat-settings-store";

type MenuPosition = {
  left: number;
  maxHeight: number;
  top?: number;
  bottom?: number;
};

type ModelOption = {
  modelId: CuratedModelId;
  label: string;
};

type ModelProvider = {
  api: Api;
  label: string;
  models: ModelOption[];
};

const LEFT_PANEL_WIDTH = 168;
const RIGHT_PANEL_WIDTH = 198;
const VIEWPORT_PADDING = 12;
const MAX_MENU_HEIGHT = 280;
const MIN_VISIBLE_MENU_HEIGHT = 120;

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function isSamePosition(
  left: MenuPosition | null,
  right: MenuPosition | null,
): boolean {
  if (left === right) {
    return true;
  }

  if (!left || !right) {
    return false;
  }

  return (
    left.top === right.top &&
    left.bottom === right.bottom &&
    left.left === right.left &&
    left.maxHeight === right.maxHeight
  );
}

function formatDisplayLabel(value: string): string {
  const shortValue = getShortModelId(value as CuratedModelId);

  if (shortValue.startsWith("gpt-")) {
    return shortValue
      .replace(/^gpt-/, "GPT-")
      .replace(/-mini\b/g, " Mini")
      .replace(/-nano\b/g, " Nano")
      .replace(/-pro\b/g, " Pro")
      .replace(/-codex\b/g, " Codex")
      .replace(/-spark\b/g, " Spark");
  }

  const normalized = shortValue.replace(/-(\d+)-(\d+)$/, " $1.$2");
  return normalized
    .split("-")
    .map((part, index) => {
      if (index === 0) {
        return part.charAt(0).toUpperCase() + part.slice(1);
      }

      if (/^\d+(?:\.\d+)?$/.test(part)) {
        return part;
      }

      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
}

function buildFallbackProviders(): ModelProvider[] {
  const groups = new Map<Api, ModelProvider>();

  for (const option of CHAT_MODEL_OPTIONS) {
    const existing = groups.get(option.api);
    if (existing) {
      existing.models.push({
        modelId: option.modelId,
        label: formatDisplayLabel(option.modelId),
      });
      continue;
    }

    groups.set(option.api, {
      api: option.api,
      label: PROVIDER_LABELS[option.api] ?? option.group,
      models: [
        {
          modelId: option.modelId,
          label: formatDisplayLabel(option.modelId),
        },
      ],
    });
  }

  return Array.from(groups.values());
}

function getProviderMenuPosition(triggerRect: DOMRect): MenuPosition {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const spaceAbove = triggerRect.top - VIEWPORT_PADDING;
  const spaceBelow = viewportHeight - triggerRect.bottom - VIEWPORT_PADDING;
  const shouldOpenAbove = spaceBelow < MIN_VISIBLE_MENU_HEIGHT && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    MAX_MENU_HEIGHT,
    Math.max(shouldOpenAbove ? spaceAbove : spaceBelow, MIN_VISIBLE_MENU_HEIGHT),
  );

  return shouldOpenAbove
    ? {
        bottom: viewportHeight - triggerRect.top,
        left: clamp(
          triggerRect.left,
          VIEWPORT_PADDING,
          viewportWidth - LEFT_PANEL_WIDTH - VIEWPORT_PADDING,
        ),
        maxHeight,
      }
    : {
        top: triggerRect.bottom,
        left: clamp(
          triggerRect.left,
          VIEWPORT_PADDING,
          viewportWidth - LEFT_PANEL_WIDTH - VIEWPORT_PADDING,
        ),
        maxHeight,
      };
}

function getSubMenuMenuPosition(providerMenuPosition: MenuPosition): MenuPosition {
  const viewportWidth = window.innerWidth;

  return {
    left: clamp(
      providerMenuPosition.left + LEFT_PANEL_WIDTH - 1,
      VIEWPORT_PADDING,
      viewportWidth - RIGHT_PANEL_WIDTH - VIEWPORT_PADDING,
    ),
    maxHeight: providerMenuPosition.maxHeight,
    top: providerMenuPosition.top,
    bottom: providerMenuPosition.bottom,
  };
}

export function PromptModelPicker() {
  const selectedApi = useChatSettingsStore((state) => state.api);
  const selectedModelId = useChatSettingsStore((state) => state.modelId);
  const enabledProviders = useChatSettingsStore((state) => state.enabledProviders);
  const enabledModels = useChatSettingsStore((state) => state.enabledModels);
  const setSelectedModel = useChatSettingsStore((state) => state.setModel);
  const { data } = useModelsQuery();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [activeApi, setActiveApi] = useState<Api | null>(null);
  const [providerMenuPosition, setProviderMenuPosition] = useState<MenuPosition | null>(null);
  const [subMenuPosition, setSubMenuPosition] = useState<MenuPosition | null>(null);
  const fallbackProviders = useMemo(() => buildFallbackProviders(), []);
  const allProviders: ModelProvider[] = data?.providers?.length
    ? data.providers.map((provider) => ({
        api: provider.api,
        label: provider.label,
        models: provider.models.map((model) => ({
          modelId: model.modelId as CuratedModelId,
          label: model.label,
        })),
      }))
    : fallbackProviders;
  const providers = useMemo(
    () =>
      allProviders
        .map((provider) => ({
          ...provider,
          models: provider.models.filter((model) => enabledModels[model.modelId] === true),
        }))
        .filter((provider) => enabledProviders[provider.api] === true && provider.models.length > 0),
    [allProviders, enabledModels, enabledProviders],
  );
  const activeProvider =
    providers.find((provider) => provider.api === activeApi) ?? providers[0] ?? null;
  const selectedProvider =
    providers.find((provider) => provider.api === selectedApi) ??
    providers.find((provider) => provider.models.some((model) => model.modelId === selectedModelId)) ??
    providers[0] ??
    null;
  const selectedModelLabel =
    selectedProvider?.models.find((model) => model.modelId === selectedModelId)?.label ??
    formatDisplayLabel(selectedModelId);

  const updateSubMenuPosition = useCallback(
    (nextApi: Api | null, basePosition: MenuPosition | null = providerMenuPosition) => {
      if (typeof window === "undefined" || !basePosition || !nextApi) {
        setSubMenuPosition((current) => (current === null ? current : null));
        return;
      }

      const nextPosition = getSubMenuMenuPosition(basePosition);
      setSubMenuPosition((current) => (isSamePosition(current, nextPosition) ? current : nextPosition));
    },
    [providerMenuPosition],
  );

  const updateProviderMenuPosition = useCallback((nextApi: Api | null = activeApi) => {
    if (typeof window === "undefined" || !triggerRef.current) {
      return;
    }

    const nextPosition = getProviderMenuPosition(triggerRef.current.getBoundingClientRect());

    setProviderMenuPosition((current) => {
      return isSamePosition(current, nextPosition) ? current : nextPosition;
    });

    if (!nextApi) {
      setSubMenuPosition((current) => (current === null ? current : null));
      return;
    }

    const nextSubMenuPosition = getSubMenuMenuPosition(nextPosition);
    setSubMenuPosition((current) =>
      isSamePosition(current, nextSubMenuPosition) ? current : nextSubMenuPosition,
    );
  }, [activeApi]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function handlePointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) {
        return;
      }

      setIsOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    function handleViewportChange() {
      updateProviderMenuPosition(activeApi);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);

    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [activeApi, isOpen, updateProviderMenuPosition]);

  if (!selectedProvider || !activeProvider) {
    return null;
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-label="Select model"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => {
          if (isOpen) {
            setIsOpen(false);
            setActiveApi(null);
            setSubMenuPosition(null);
            return;
          }

          setActiveApi(null);
          setSubMenuPosition(null);
          updateProviderMenuPosition(null);
          setIsOpen(true);
        }}
        className="inline-flex h-7 min-w-[110px] max-w-[110px] shrink-0 items-center gap-0.5 rounded-md px-2 text-[13px] font-medium leading-[1.15] text-black/56 transition-colors hover:bg-accent hover:text-black/76 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:text-white/54 dark:hover:text-white/76 dark:focus-visible:ring-white/12"
        title={`${selectedProvider.label} / ${selectedModelLabel}`}
      >
        <span className="min-w-0 truncate">
          {selectedModelLabel}
        </span>
        <HugeiconsIcon
          icon={ArrowRight01Icon}
          size={13}
          color="currentColor"
          strokeWidth={1.9}
          className={[
            "ml-auto shrink-0 rotate-90 transition-transform",
            isOpen ? "rotate-[270deg]" : "rotate-90",
          ].join(" ")}
        />
      </button>

      {isOpen && providerMenuPosition && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              className="fixed z-[70]"
            >
              <div
                className="fixed overflow-hidden rounded-xl border border-black/8 bg-white shadow-[0_10px_28px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#151515] dark:shadow-[0_14px_32px_rgba(0,0,0,0.24)]"
                style={{
                  left: providerMenuPosition.left,
                  maxHeight: providerMenuPosition.maxHeight,
                  ...(providerMenuPosition.top !== undefined
                    ? { top: providerMenuPosition.top }
                    : { bottom: providerMenuPosition.bottom }),
                  width: LEFT_PANEL_WIDTH,
                }}
                role="menu"
                aria-label="Model providers"
              >
                <div className="max-h-full overflow-y-auto p-1">
                  {providers.map((provider) => {
                    const isActive = provider.api === activeApi;

                    return (
                      <button
                        key={provider.api}
                        type="button"
                        role="menuitem"
                        onMouseEnter={() => {
                          setActiveApi(provider.api);
                          updateSubMenuPosition(provider.api, providerMenuPosition);
                        }}
                        onFocus={() => {
                          setActiveApi(provider.api);
                          updateSubMenuPosition(provider.api, providerMenuPosition);
                        }}
                        className={[
                          "flex h-8 w-full items-center gap-2 rounded-lg px-2.5 text-left text-[13px] leading-[1.15] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:focus-visible:ring-white/12",
                          isActive
                            ? "bg-accent text-black dark:text-white"
                            : "text-black/74 hover:bg-accent dark:text-white/74 dark:hover:text-white",
                        ].join(" ")}
                      >
                        <span className="min-w-0 flex-1 truncate">{provider.label}</span>
                        <HugeiconsIcon
                          icon={ArrowRight01Icon}
                          size={13}
                          color="currentColor"
                          strokeWidth={1.8}
                          className="shrink-0"
                        />
                      </button>
                    );
                  })}
                </div>
              </div>

              {activeApi && activeProvider && subMenuPosition ? (
                <div
                  className="fixed z-[71] overflow-hidden rounded-xl border border-black/8 bg-white shadow-[0_10px_28px_rgba(0,0,0,0.06)] dark:border-white/10 dark:bg-[#151515] dark:shadow-[0_14px_32px_rgba(0,0,0,0.24)]"
                  style={{
                    left: subMenuPosition.left,
                    maxHeight: subMenuPosition.maxHeight,
                    ...(subMenuPosition.top !== undefined
                      ? { top: subMenuPosition.top }
                      : { bottom: subMenuPosition.bottom }),
                    width: RIGHT_PANEL_WIDTH,
                  }}
                  role="menu"
                  aria-label={`${activeProvider.label} models`}
                >
                  <div className="max-h-full overflow-y-auto p-1">
                    {activeProvider.models.map((model) => {
                      const isSelected = model.modelId === selectedModelId;

                      return (
                        <button
                          key={model.modelId}
                          type="button"
                          role="menuitemradio"
                          aria-checked={isSelected}
                          onClick={() => {
                            setSelectedModel(model.modelId);
                            setIsOpen(false);
                          }}
                          className={[
                            "flex min-h-8 w-full items-center rounded-lg px-2.5 py-1.5 text-left text-[13px] leading-[1.15] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 dark:focus-visible:ring-white/12",
                            isSelected
                              ? "bg-accent text-black dark:text-white"
                              : "text-black/76 hover:bg-accent dark:text-white/76 dark:hover:text-white",
                          ].join(" ")}
                          title={model.modelId}
                        >
                          <span className="truncate">{model.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
