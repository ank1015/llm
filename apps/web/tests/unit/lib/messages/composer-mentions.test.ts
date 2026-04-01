import { describe, expect, it } from "vitest";

import {
  buildFileLabel,
  extractActiveMention,
  getRelativeMentionPath,
  rankProjectFiles,
  removeMentionBeforeCaret,
  replaceMentionToken,
} from "@/lib/messages/composer-mentions";

import type { ProjectFileIndexEntryDto } from "@/lib/client-api";

const CURRENT_ARTIFACT_ROOT: ProjectFileIndexEntryDto = {
  artifactId: "artifact-1",
  artifactName: "Artifact 1",
  path: "",
  type: "directory",
  artifactPath: "artifact-1/",
  size: 0,
  updatedAt: "2026-03-27T00:00:00.000Z",
};

const SIBLING_FILE: ProjectFileIndexEntryDto = {
  artifactId: "artifact-2",
  artifactName: "Artifact 2",
  path: "images/logo.png",
  type: "file",
  artifactPath: "artifact-2/images/logo.png",
  size: 42,
  updatedAt: "2026-03-27T00:00:00.000Z",
};

describe("composer mention helpers", () => {
  it("extracts an active mention around the caret", () => {
    expect(extractActiveMention("Look at @artifact-1/src", "Look at @artifact-1/src".length)).toEqual({
      start: 8,
      end: 23,
      query: "artifact-1/src",
    });
  });

  it("rejects invalid mention boundaries", () => {
    expect(extractActiveMention("word@artifact-1", "word@artifact-1".length)).toBeNull();
  });

  it("builds relative mention paths for current and sibling artifacts", () => {
    expect(getRelativeMentionPath("artifact-1", CURRENT_ARTIFACT_ROOT)).toBe("./");
    expect(getRelativeMentionPath("artifact-1", SIBLING_FILE)).toBe(
      "../artifact-2/images/logo.png",
    );
  });

  it("ranks closer matches ahead of looser matches", () => {
    const exactFile: ProjectFileIndexEntryDto = {
      artifactId: "artifact-1",
      artifactName: "Artifact 1",
      path: "src/index.ts",
      type: "file",
      artifactPath: "artifact-1/src/index.ts",
      size: 10,
      updatedAt: "2026-03-27T00:00:00.000Z",
    };
    const partialFile: ProjectFileIndexEntryDto = {
      artifactId: "artifact-1",
      artifactName: "Artifact 1",
      path: "src/index.test.ts",
      type: "file",
      artifactPath: "artifact-1/src/index.test.ts",
      size: 10,
      updatedAt: "2026-03-27T00:00:00.000Z",
    };

    expect(rankProjectFiles([partialFile, exactFile], "src/index.ts")).toEqual([
      exactFile,
      partialFile,
    ]);
  });

  it("replaces an active mention token and adds a trailing space", () => {
    const mention = extractActiveMention("@artifact-1/", "@artifact-1/".length);
    expect(mention).not.toBeNull();
    expect(replaceMentionToken("@artifact-1/", mention!, "@./")).toEqual({
      value: "@./ ",
      cursor: 4,
    });
  });

  it("removes a completed mention token on backspace", () => {
    expect(removeMentionBeforeCaret("Check @./src/app.ts ", "Check @./src/app.ts ".length)).toEqual(
      {
        value: "Check ",
        cursor: 6,
      },
    );
  });

  it("builds the label text used in the dropdown", () => {
    expect(buildFileLabel(CURRENT_ARTIFACT_ROOT)).toBe("Artifact root");
    expect(buildFileLabel(SIBLING_FILE)).toBe("Artifact 2/images");
  });
});
