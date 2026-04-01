import { afterEach, describe, expect, it, vi } from "vitest";

describe("keys client-api", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("sends credentials when setting a provider key", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        headers: {
          "Content-Type": "application/json",
        },
        status: 200,
      }),
    );

    vi.stubGlobal("fetch", fetchMock);

    const { setKey } = await import("@/lib/client-api/keys");

    await setKey("codex", {
      apiKey: "secret",
      "chatgpt-account-id": "acct_123",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "http://localhost:8001/api/keys/codex",
      expect.objectContaining({
        method: "PUT",
        body: JSON.stringify({
          credentials: {
            apiKey: "secret",
            "chatgpt-account-id": "acct_123",
          },
        }),
      }),
    );
  });
});
