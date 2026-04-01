import { afterEach, describe, expect, it, vi } from "vitest";

describe("client-api barrel", () => {
  afterEach(() => {
    vi.resetModules();
  });

  it("does not export removed skill endpoints", async () => {
    const clientApi = await import("@/lib/client-api");

    expect("installArtifactSkill" in clientApi).toBe(false);
    expect("listBundledSkills" in clientApi).toBe(false);
    expect("listInstalledArtifactSkills" in clientApi).toBe(false);
  });
});
