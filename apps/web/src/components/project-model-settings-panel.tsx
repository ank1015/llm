"use client";

import { createPortal } from "react-dom";
import { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";

import {
  useKeyDetailsQuery,
  useModelsQuery,
  useReloadKeyMutation,
  useSetKeyMutation,
} from "@/hooks/api";
import { useChatSettingsStore } from "@/stores/chat-settings-store";

import type { KeyCredentialFieldDto, KeyProviderContract } from "@/lib/client-api";
import type { Api, CuratedModelId } from "@ank1015/llm-sdk";

type ModelProvider = {
  api: Api;
  label: string;
  models: Array<{
    modelId: CuratedModelId;
    label: string;
  }>;
};

const AUTO_LOAD_KEY_PROVIDERS = new Set<KeyProviderContract>(["codex", "claude-code"]);

function isCredentialFieldSensitive(field: KeyCredentialFieldDto): boolean {
  const normalized = field.option.toLowerCase();
  return normalized.includes("key") || normalized.includes("token");
}

function formatCredentialFieldLabel(field: KeyCredentialFieldDto): string {
  if (field.option === "apiKey") {
    return "API Key";
  }

  return field.option
    .replace(/-/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .split(" ")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function hasCompleteCredentials(input: {
  fields: KeyCredentialFieldDto[];
  credentials: Record<string, string>;
}): boolean {
  return input.fields.every((field) => {
    const value = input.credentials[field.option];
    return typeof value === "string" && value.trim().length > 0;
  });
}

function SettingsToggle({
  checked,
  disabled,
  onToggle,
  ariaLabel,
  size = "default",
}: {
  checked: boolean;
  disabled?: boolean;
  onToggle: () => void;
  ariaLabel: string;
  size?: "default" | "small";
}) {
  const isSmall = size === "small";

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={ariaLabel}
      onClick={onToggle}
      disabled={disabled}
      className={[
        isSmall ? "inline-flex h-5 w-8" : "inline-flex h-6 w-10",
        "shrink-0 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black/12 disabled:cursor-not-allowed disabled:opacity-60 dark:focus-visible:ring-white/12",
        checked
          ? "border-black bg-black dark:border-white dark:bg-white"
          : "border-black/10 bg-black/6 dark:border-white/10 dark:bg-white/8",
      ].join(" ")}
    >
      <span
        className={[
          isSmall ? "mt-[2px] ml-[2px] inline-flex h-[14px] w-[14px]" : "mt-[2px] ml-[2px] inline-flex h-[18px] w-[18px]",
          "rounded-full transition-transform",
          checked
            ? isSmall
              ? "translate-x-3 bg-white dark:bg-black"
              : "translate-x-4 bg-white dark:bg-black"
            : "translate-x-0 bg-white dark:bg-[#0E0E0E]",
        ].join(" ")}
      />
    </button>
  );
}

function ProviderCredentialsDialog({
  provider,
  providerLabel,
  open,
  onClose,
  onSaved,
}: {
  provider: KeyProviderContract;
  providerLabel: string;
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}) {
  const detailsQuery = useKeyDetailsQuery(provider);
  const saveCredentials = useSetKeyMutation(provider);
  const reloadCredentials = useReloadKeyMutation(provider);
  const [draftValues, setDraftValues] = useState<Record<string, string> | null>(null);
  const supportsAutoLoad = AUTO_LOAD_KEY_PROVIDERS.has(provider);
  const isBusy = saveCredentials.isPending || reloadCredentials.isPending;

  const handleClose = useCallback(() => {
    setDraftValues(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !isBusy) {
        handleClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [handleClose, isBusy, open]);

  async function handleSave() {
    if (!detailsQuery.data || isBusy) {
      return;
    }

    const nextValues = draftValues
      ? {
          ...detailsQuery.data.credentials,
          ...draftValues,
        }
      : detailsQuery.data.credentials;

    const payload = Object.fromEntries(
      detailsQuery.data.fields
        .map((field) => [field.option, nextValues[field.option]?.trim() ?? ""])
        .filter((entry) => entry[1].length > 0),
    );

    if (
      detailsQuery.data.fields.some((field) => (payload[field.option] ?? "").trim().length === 0)
    ) {
      toast.error("Complete all required credential fields.");
      return;
    }

    try {
      await saveCredentials.mutateAsync(payload);
      toast.success("Credentials saved.");
      onSaved();
      handleClose();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save credentials.");
    }
  }

  async function handleAutoLoad() {
    if (!supportsAutoLoad || isBusy) {
      return;
    }

    try {
      await reloadCredentials.mutateAsync();
      const refreshed = await detailsQuery.refetch();
      const nextDetails = refreshed.data;

      if (
        nextDetails &&
        hasCompleteCredentials({
          fields: nextDetails.fields,
          credentials: nextDetails.credentials,
        })
      ) {
        toast.success("Credentials loaded.");
        onSaved();
        handleClose();
        return;
      }

      toast.error("No local credentials were found.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to auto load credentials.");
    }
  }

  if (!open || typeof document === "undefined") {
    return null;
  }

  const values = detailsQuery.data
    ? {
        ...detailsQuery.data.credentials,
        ...(draftValues ?? {}),
      }
    : {};

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-black/24 px-4 backdrop-blur-[10px]"
      onClick={() => {
        if (!isBusy) {
          handleClose();
        }
      }}
    >
      <div
        className="w-full max-w-lg rounded-2xl border border-black/8 bg-white p-5 shadow-[0_18px_48px_rgba(0,0,0,0.12)] dark:border-white/10 dark:bg-[#171717] dark:shadow-[0_18px_48px_rgba(0,0,0,0.34)]"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="space-y-1">
          <h2 className="text-lg font-medium text-black dark:text-white">Connect {providerLabel}</h2>
          <p className="text-sm leading-6 text-black/52 dark:text-white/54">
            Enter the credentials required to enable this provider in the prompt input.
          </p>
          {supportsAutoLoad ? (
            <p className="text-[12px] leading-5 text-black/38 dark:text-white/38">
              Auto load reads existing local auth for this provider and fills the shared keys file.
            </p>
          ) : null}
        </div>

        <div className="mt-5">
          {detailsQuery.isPending ? (
            <p className="text-sm text-black/48 dark:text-white/48">Loading credentials…</p>
          ) : detailsQuery.isError || !detailsQuery.data ? (
            <p className="text-sm text-[#FF6363]">Could not load credential fields.</p>
          ) : (
            <div className="space-y-4">
              {detailsQuery.data.fields.map((field) => (
                <label key={field.option} className="block space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-sm font-medium text-black dark:text-white">
                      {formatCredentialFieldLabel(field)}
                    </span>
                    <span className="text-[11px] text-black/34 dark:text-white/34">
                      {field.env}
                    </span>
                  </div>
                  <input
                    type={isCredentialFieldSensitive(field) ? "password" : "text"}
                    value={values[field.option] ?? ""}
                    onChange={(event) =>
                      setDraftValues((current) => ({
                        ...(current ?? {}),
                        [field.option]: event.target.value,
                      }))
                    }
                    placeholder={field.env}
                    className="w-full rounded-2xl border border-black/8 bg-transparent px-4 py-3 text-sm text-black outline-none transition focus:border-black/14 focus:ring-2 focus:ring-black/10 dark:border-white/10 dark:text-white dark:focus:border-white/18 dark:focus:ring-white/10"
                  />
                  {field.aliases.length > 0 ? (
                    <p className="text-[11px] leading-5 text-black/34 dark:text-white/34">
                      Aliases: {field.aliases.join(", ")}
                    </p>
                  ) : null}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex items-center justify-between gap-3">
          <div>
            {supportsAutoLoad ? (
              <button
                type="button"
                onClick={() => void handleAutoLoad()}
                disabled={detailsQuery.isPending || isBusy}
                className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-black/62 transition-colors hover:bg-accent hover:text-black disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/62 dark:hover:bg-accent dark:hover:text-white"
              >
                {reloadCredentials.isPending ? "Loading..." : "Auto load"}
              </button>
            ) : null}
          </div>

          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={isBusy}
              className="inline-flex h-10 items-center justify-center rounded-xl px-4 text-sm font-medium text-black/56 transition-colors hover:bg-accent hover:text-black disabled:cursor-not-allowed disabled:opacity-60 dark:text-white/58 dark:hover:bg-accent dark:hover:text-white"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={detailsQuery.isPending || isBusy}
              className="inline-flex h-10 items-center justify-center rounded-xl bg-black px-4 text-sm font-medium text-white transition-opacity hover:opacity-92 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-white dark:text-black"
            >
              {saveCredentials.isPending ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function ProviderRow({
  provider,
  collapsed,
  onToggleCollapsed,
  onRequestCredentials,
}: {
  provider: ModelProvider;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  onRequestCredentials: (provider: ModelProvider) => void;
}) {
  const keyProvider = provider.api as KeyProviderContract;
  const detailsQuery = useKeyDetailsQuery(keyProvider);
  const isProviderEnabled = useChatSettingsStore((state) => state.isProviderEnabled(provider.api));
  const isModelEnabled = useChatSettingsStore((state) => state.isModelEnabled);
  const setProviderEnabled = useChatSettingsStore((state) => state.setProviderEnabled);
  const setModelEnabled = useChatSettingsStore((state) => state.setModelEnabled);
  const hasCredentials = detailsQuery.data
    ? hasCompleteCredentials({
        fields: detailsQuery.data.fields,
        credentials: detailsQuery.data.credentials,
      })
    : false;

  function handleProviderToggle() {
    if (detailsQuery.isPending) {
      return;
    }

    if (detailsQuery.isError || !detailsQuery.data) {
      toast.error("Could not load provider credentials.");
      return;
    }

    if (!isProviderEnabled) {
      if (!hasCredentials) {
        onRequestCredentials(provider);
        return;
      }

      const result = setProviderEnabled({
        api: provider.api,
        enabled: true,
        modelIds: provider.models.map((model) => model.modelId),
      });

      if (!result.ok) {
        toast.error(result.reason);
        return;
      }

      if (collapsed) {
        onToggleCollapsed();
      }
      return;
    }

    const result = setProviderEnabled({
      api: provider.api,
      enabled: false,
      modelIds: provider.models.map((model) => model.modelId),
    });

    if (!result.ok) {
      toast.error(result.reason);
    }
  }
  const showModels = isProviderEnabled && !collapsed;

  return (
    <section className="py-2">
      <div className="flex items-start gap-4 py-3">
        <div className="min-w-0 flex flex-1 items-start gap-3">
          <button
            type="button"
            aria-label={collapsed ? `Expand ${provider.label} models` : `Collapse ${provider.label} models`}
            onClick={onToggleCollapsed}
            disabled={!isProviderEnabled}
            className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-black/40 transition-colors hover:bg-accent hover:text-black disabled:cursor-default disabled:opacity-30 dark:text-white/40 dark:hover:bg-accent dark:hover:text-white"
          >
            <HugeiconsIcon
              icon={ArrowRight01Icon}
              size={14}
              color="currentColor"
              strokeWidth={1.9}
              className={["transition-transform duration-200", collapsed ? "rotate-0" : "rotate-90"].join(" ")}
            />
          </button>

          <div className="min-w-0 flex-1">
            <h2 className="text-[16px] font-medium tracking-[-0.01em] text-black dark:text-white">
              {provider.label}
            </h2>
          </div>
        </div>

        <SettingsToggle
          checked={isProviderEnabled}
          disabled={detailsQuery.isPending}
          onToggle={handleProviderToggle}
          ariaLabel={`${isProviderEnabled ? "Disable" : "Enable"} ${provider.label}`}
        />
      </div>

      <div
        className={[
          "grid overflow-hidden transition-[grid-template-rows,opacity,margin] duration-200 ease-out",
          showModels ? "mt-1 grid-rows-[1fr] opacity-100" : "mt-0 grid-rows-[0fr] opacity-0",
        ].join(" ")}
      >
        <div className="overflow-hidden">
          <div className="space-y-1 pb-1 pl-9">
            {provider.models.map((model) => {
              const enabled = isModelEnabled(model.modelId);

              return (
                <div
                  key={model.modelId}
                  className="flex items-center gap-4 py-2"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium text-black/76 dark:text-white/76">
                      {model.label}
                    </p>
                  </div>
                  <SettingsToggle
                    checked={enabled}
                    size="small"
                    onToggle={() => {
                      const result = setModelEnabled({
                        api: provider.api,
                        modelId: model.modelId,
                        enabled: !enabled,
                      });

                      if (!result.ok) {
                        toast.error(result.reason);
                      }
                    }}
                    ariaLabel={`${enabled ? "Disable" : "Enable"} ${model.label}`}
                  />
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}

export function ProjectModelSettingsPanel() {
  const { data, isPending, isError } = useModelsQuery();
  const [credentialsProvider, setCredentialsProvider] = useState<ModelProvider | null>(null);
  const [collapsedProviders, setCollapsedProviders] = useState<Partial<Record<Api, boolean>>>({});

  const providers = useMemo<ModelProvider[]>(
    () =>
      (data?.providers ?? []).map((provider) => ({
        api: provider.api,
        label: provider.label,
        models: provider.models.map((model) => ({
          modelId: model.modelId as CuratedModelId,
          label: model.label,
        })),
      })),
    [data?.providers],
  );

  return (
    <>
      <div className="mt-8 pb-20">
        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <div key={`provider-skeleton-${index}`} className="animate-pulse py-3">
                <div className="h-4 w-44 rounded bg-black/6 dark:bg-white/[0.06]" />
              </div>
            ))}
          </div>
        ) : isError ? (
          <div className="py-6">
            <p className="text-sm text-[#FF6363]">Could not load available providers.</p>
          </div>
        ) : providers.length === 0 ? (
          <div className="py-6">
            <p className="text-sm text-black/48 dark:text-white/48">No providers available.</p>
          </div>
        ) : (
          <div className="space-y-1">
            {providers.map((provider) => (
              <ProviderRow
                key={provider.api}
                provider={provider}
                collapsed={collapsedProviders[provider.api] ?? false}
                onToggleCollapsed={() =>
                  setCollapsedProviders((current) => ({
                    ...current,
                    [provider.api]: !(current[provider.api] ?? false),
                  }))
                }
                onRequestCredentials={setCredentialsProvider}
              />
            ))}
          </div>
        )}
      </div>

      {credentialsProvider ? (
        <ProviderCredentialsDialog
          provider={credentialsProvider.api as KeyProviderContract}
          providerLabel={credentialsProvider.label}
          open
          onClose={() => setCredentialsProvider(null)}
          onSaved={() => {
            useChatSettingsStore.getState().setProviderEnabled({
              api: credentialsProvider.api,
              enabled: true,
              modelIds: credentialsProvider.models.map((model) => model.modelId),
            });
            setCollapsedProviders((current) => ({
              ...current,
              [credentialsProvider.api]: false,
            }));
          }}
        />
      ) : null}
    </>
  );
}
