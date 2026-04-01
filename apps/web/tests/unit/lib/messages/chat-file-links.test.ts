import { describe, expect, it } from "vitest";

import {
  createArtifactFilePathResolver,
  linkifyArtifactFileText,
} from "@/lib/messages/chat-file-links";

describe("chat file link resolver", () => {
  const resolve = createArtifactFilePathResolver({
    artifactId: "coach",
    filePaths: [
      "src/app/page.tsx",
      "package.json",
      ".env",
      ".gitignore",
      "docs/guide.md",
    ],
  });

  it("resolves exact relative paths", () => {
    expect(resolve("src/app/page.tsx")).toBe("src/app/page.tsx");
  });

  it("resolves ./-prefixed paths", () => {
    expect(resolve("./src/app/page.tsx")).toBe("src/app/page.tsx");
  });

  it("resolves root-level files", () => {
    expect(resolve(".env")).toBe(".env");
    expect(resolve(".gitignore")).toBe(".gitignore");
    expect(resolve("package.json")).toBe("package.json");
  });

  it("resolves current-artifact-prefixed paths only for the active artifact", () => {
    expect(resolve("coach/src/app/page.tsx")).toBe("src/app/page.tsx");
    expect(resolve("data/src/app/page.tsx")).toBeNull();
  });

  it("does not resolve nested files by basename alone", () => {
    expect(resolve("page.tsx")).toBeNull();
    expect(resolve("guide.md")).toBeNull();
  });

  it("resolves nested paths exactly even when a root file shares the basename", () => {
    const nestedResolve = createArtifactFilePathResolver({
      artifactId: "coach",
      filePaths: ["intro.py", "src/intro.py"],
    });

    expect(nestedResolve("intro.py")).toBe("intro.py");
    expect(nestedResolve("src/intro.py")).toBe("src/intro.py");
  });
});

describe("chat file text linkification", () => {
  const resolve = createArtifactFilePathResolver({
    artifactId: "coach",
    filePaths: ["src/app/page.tsx", ".env"],
  });

  it("excludes trailing punctuation from clickable matches", () => {
    expect(linkifyArtifactFileText("Open src/app/page.tsx, please.", resolve)).toEqual([
      { type: "text", value: "Open" },
      { type: "text", value: " " },
      { type: "file-link", value: "src/app/page.tsx", path: "src/app/page.tsx" },
      { type: "text", value: "," },
      { type: "text", value: " " },
      { type: "text", value: "please." },
    ]);
  });

  it("ignores URLs", () => {
    expect(linkifyArtifactFileText("https://example.com/src/app/page.tsx", resolve)).toEqual([
      { type: "text", value: "https://example.com/src/app/page.tsx" },
    ]);
  });
});
