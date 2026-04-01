import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PromptModelPicker } from "@/components/prompt-model-picker";
import { useModelsQuery } from "@/hooks/api";
import { useChatSettingsStore } from "@/stores/chat-settings-store";

vi.mock("@/hooks/api", () => ({
  useModelsQuery: vi.fn(),
}));

const useModelsQueryMock = vi.mocked(useModelsQuery);

describe("PromptModelPicker", () => {
  beforeEach(() => {
    useChatSettingsStore.getState().reset();

    useModelsQueryMock.mockReturnValue({
      data: {
        providers: [
          {
            api: "openai",
            label: "OpenAI",
            models: [{ modelId: "openai/gpt-5.4", label: "GPT-5.4" }],
          },
          {
            api: "codex",
            label: "Codex",
            models: [{ modelId: "codex/gpt-5.4", label: "GPT-5.4" }],
          },
        ],
      },
    } as ReturnType<typeof useModelsQuery>);

    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
      x: 120,
      y: 120,
      left: 120,
      top: 120,
      right: 230,
      bottom: 148,
      width: 110,
      height: 28,
      toJSON: () => ({}),
    } as DOMRect);
  });

  it("shows only active providers in the picker menu", () => {
    render(<PromptModelPicker />);

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    expect(screen.getByRole("menuitem", { name: "Codex" })).toBeInTheDocument();
    expect(screen.queryByRole("menuitem", { name: "OpenAI" })).not.toBeInTheDocument();
  });

  it("shows newly enabled providers in the picker menu", () => {
    useChatSettingsStore.getState().setProviderEnabled({
      api: "openai",
      enabled: true,
      modelIds: ["openai/gpt-5.4"],
    });

    render(<PromptModelPicker />);

    fireEvent.click(screen.getByRole("button", { name: "Select model" }));

    expect(screen.getByRole("menuitem", { name: "Codex" })).toBeInTheDocument();
    expect(screen.getByRole("menuitem", { name: "OpenAI" })).toBeInTheDocument();
  });
});
