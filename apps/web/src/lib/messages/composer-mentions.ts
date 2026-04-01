"use client";

import type { ProjectFileIndexEntryDto } from "@/lib/client-api";

export const MENTION_SEARCH_LIMIT = 80;
export const MENTION_DROPDOWN_LIMIT = 20;
export const MENTION_SEARCH_DEBOUNCE_MS = 120;

export type MentionRange = {
  start: number;
  end: number;
  query: string;
};

function getBasename(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const segments = normalized.split("/");
  return segments[segments.length - 1] ?? path;
}

export function isArtifactRootEntry(entry: ProjectFileIndexEntryDto): boolean {
  return entry.type === "directory" && entry.path.length === 0;
}

function getDirname(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const index = normalized.lastIndexOf("/");
  if (index === -1) {
    return "";
  }

  return normalized.slice(0, index);
}

function getPathSegments(path: string): string[] {
  return path
    .replace(/\\/g, "/")
    .split("/")
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function formatIndexedMentionPath(
  path: string,
  type: ProjectFileIndexEntryDto["type"],
): string {
  if (type !== "directory") {
    return path;
  }

  return path.endsWith("/") ? path : `${path}/`;
}

export function getRelativeMentionPath(
  currentArtifactId: string,
  entry: ProjectFileIndexEntryDto,
): string {
  const fromSegments = getPathSegments(currentArtifactId);
  const toSegments = getPathSegments(`${entry.artifactId}/${entry.path}`);

  let sharedLength = 0;
  while (
    sharedLength < fromSegments.length &&
    sharedLength < toSegments.length &&
    fromSegments[sharedLength] === toSegments[sharedLength]
  ) {
    sharedLength += 1;
  }

  const upSegments = Array.from({ length: fromSegments.length - sharedLength }, () => "..");
  const downSegments = toSegments.slice(sharedLength);
  const relativePath = [...upSegments, ...downSegments].join("/");
  const normalizedRelativePath =
    relativePath.length > 0 ? relativePath : isArtifactRootEntry(entry) ? "." : entry.path;

  return formatIndexedMentionPath(normalizedRelativePath, entry.type);
}

export function getIndexedEntryDisplayName(entry: ProjectFileIndexEntryDto): string {
  if (isArtifactRootEntry(entry)) {
    return formatIndexedMentionPath(entry.artifactName, entry.type);
  }

  return formatIndexedMentionPath(getBasename(entry.path), entry.type);
}

function isBoundaryChar(ch: string | undefined): boolean {
  if (!ch) {
    return true;
  }

  return /\s|[([{,]/.test(ch);
}

export function extractActiveMention(value: string, caret: number): MentionRange | null {
  const safeCaret = Math.max(0, Math.min(caret, value.length));

  let tokenStart = safeCaret;
  while (tokenStart > 0 && !/\s/.test(value[tokenStart - 1] ?? "")) {
    tokenStart -= 1;
  }

  if (value[tokenStart] !== "@") {
    return null;
  }

  if (!isBoundaryChar(value[tokenStart - 1])) {
    return null;
  }

  let tokenEnd = safeCaret;
  while (tokenEnd < value.length && !/\s/.test(value[tokenEnd] ?? "")) {
    tokenEnd += 1;
  }

  const tokenBody = value.slice(tokenStart + 1, tokenEnd);
  if (/[^a-zA-Z0-9_./-]/.test(tokenBody)) {
    return null;
  }

  const query = value.slice(tokenStart + 1, safeCaret);
  if (/[^a-zA-Z0-9_./-]/.test(query)) {
    return null;
  }

  return {
    start: tokenStart,
    end: tokenEnd,
    query,
  };
}

function scoreFileMatch(entry: ProjectFileIndexEntryDto, query: string): number {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) {
    return 0;
  }

  const isArtifactRoot = isArtifactRootEntry(entry);
  const basename = getBasename(entry.path).toLowerCase();
  const filePath = entry.path.toLowerCase();
  const artifactPath = entry.artifactPath.toLowerCase();
  const artifactId = entry.artifactId.toLowerCase();
  const artifactName = entry.artifactName.toLowerCase();
  let score = 0;

  if (artifactPath === normalizedQuery) {
    score += 1000;
  } else if (artifactPath.startsWith(normalizedQuery)) {
    score += 250;
  }

  if (isArtifactRoot) {
    if (
      normalizedQuery === artifactId ||
      normalizedQuery === artifactName ||
      normalizedQuery === `${artifactId}/` ||
      normalizedQuery === `${artifactName}/`
    ) {
      score += 1200;
    }
  }

  if (basename === normalizedQuery) {
    score += 1000;
  } else if (basename.startsWith(normalizedQuery)) {
    score += 800;
  } else if (basename.includes(normalizedQuery)) {
    score += 500;
  }

  if (filePath.startsWith(normalizedQuery)) {
    score += 350;
  } else if (filePath.includes(normalizedQuery)) {
    score += 200;
  }

  if (artifactPath.includes(normalizedQuery)) {
    score += 120;
  }

  if (artifactName.includes(normalizedQuery)) {
    score += 90;
  }

  return score;
}

export function rankProjectFiles(
  entries: ProjectFileIndexEntryDto[],
  query: string,
): ProjectFileIndexEntryDto[] {
  return [...entries].sort((a, b) => {
    const scoreDiff = scoreFileMatch(b, query) - scoreFileMatch(a, query);
    if (scoreDiff !== 0) {
      return scoreDiff;
    }

    return a.artifactPath.localeCompare(b.artifactPath);
  });
}

export function mentionsEqual(a: MentionRange | null, b: MentionRange | null): boolean {
  if (!a && !b) {
    return true;
  }

  if (!a || !b) {
    return false;
  }

  return a.start === b.start && a.end === b.end && a.query === b.query;
}

export function replaceMentionToken(
  value: string,
  mention: MentionRange,
  replacement: string,
): { value: string; cursor: number } {
  const before = value.slice(0, mention.start);
  const after = value.slice(mention.end);
  const needsTrailingSpace = after.length === 0 || !/^\s/.test(after);
  const suffix = needsTrailingSpace ? " " : "";

  return {
    value: `${before}${replacement}${suffix}${after}`,
    cursor: before.length + replacement.length + suffix.length,
  };
}

export function removeMentionBeforeCaret(
  value: string,
  caret: number,
): { value: string; cursor: number } | null {
  if (caret <= 0 || caret > value.length) {
    return null;
  }

  const prefix = value.slice(0, caret);
  const trailingWhitespace = prefix.match(/\s+$/)?.[0] ?? "";
  if (trailingWhitespace.length === 0) {
    return null;
  }

  const prefixWithoutWhitespace = prefix.slice(0, prefix.length - trailingWhitespace.length);
  const mentionMatch = prefixWithoutWhitespace.match(/(?:^|\s)(@[^\s]+)$/);
  if (!mentionMatch) {
    return null;
  }

  const mentionToken = mentionMatch[1];
  if (!mentionToken || !/^@[a-zA-Z0-9_./-]+$/.test(mentionToken)) {
    return null;
  }

  const tokenStart = prefixWithoutWhitespace.length - mentionToken.length;
  const before = value.slice(0, tokenStart);
  const after = value.slice(caret);
  const normalizedAfter =
    before.endsWith(" ") && after.startsWith(" ") ? after.replace(/^\s+/, " ") : after;

  return {
    value: `${before}${normalizedAfter}`,
    cursor: tokenStart,
  };
}

export function buildFileLabel(entry: ProjectFileIndexEntryDto): string {
  if (isArtifactRootEntry(entry)) {
    return "Artifact root";
  }

  const directory = getDirname(entry.path);
  return directory.length > 0 ? `${entry.artifactName}/${directory}` : entry.artifactName;
}
