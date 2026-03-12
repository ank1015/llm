import type { ProjectFileIndexEntry } from '@/lib/client-api';

export type MentionRange = {
  start: number;
  end: number;
  query: string;
};

function getBasename(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const segments = normalized.split('/');
  return segments[segments.length - 1] ?? path;
}

function getDirname(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  if (idx === -1) {
    return '';
  }

  return normalized.slice(0, idx);
}

function getPathSegments(path: string): string[] {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .map((segment) => segment.trim())
    .filter((segment) => segment.length > 0);
}

function formatIndexedMentionPath(path: string, type: ProjectFileIndexEntry['type']): string {
  if (type !== 'directory') {
    return path;
  }

  return path.endsWith('/') ? path : `${path}/`;
}

function isBoundaryChar(ch: string | undefined): boolean {
  if (!ch) {
    return true;
  }

  return /\s|[([{,]/.test(ch);
}

export function getRelativeMentionPath(
  currentArtifactId: string,
  entry: ProjectFileIndexEntry
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

  const upSegments = Array.from({ length: fromSegments.length - sharedLength }, () => '..');
  const downSegments = toSegments.slice(sharedLength);
  const relativePath = [...upSegments, ...downSegments].join('/');

  return formatIndexedMentionPath(relativePath.length > 0 ? relativePath : entry.path, entry.type);
}

export function getIndexedEntryDisplayName(entry: ProjectFileIndexEntry): string {
  return formatIndexedMentionPath(getBasename(entry.path), entry.type);
}

export function buildFileLabel(entry: ProjectFileIndexEntry): string {
  const dir = getDirname(entry.path);
  return dir.length > 0 ? `${entry.artifactName}/${dir}` : entry.artifactName;
}

export function extractActiveMention(value: string, caret: number): MentionRange | null {
  const safeCaret = Math.max(0, Math.min(caret, value.length));

  let tokenStart = safeCaret;
  while (tokenStart > 0 && !/\s/.test(value[tokenStart - 1] ?? '')) {
    tokenStart -= 1;
  }

  if (value[tokenStart] !== '@') {
    return null;
  }

  if (!isBoundaryChar(value[tokenStart - 1])) {
    return null;
  }

  let tokenEnd = safeCaret;
  while (tokenEnd < value.length && !/\s/.test(value[tokenEnd] ?? '')) {
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

export function replaceMentionToken(
  value: string,
  mention: MentionRange,
  replacement: string
): { value: string; cursor: number } {
  const before = value.slice(0, mention.start);
  const after = value.slice(mention.end);
  const needsTrailingSpace = after.length === 0 || !/^\s/.test(after);
  const suffix = needsTrailingSpace ? ' ' : '';

  return {
    value: `${before}${replacement}${suffix}${after}`,
    cursor: before.length + replacement.length + suffix.length,
  };
}

export function removeMentionBeforeCaret(
  value: string,
  caret: number
): { value: string; cursor: number } | null {
  if (caret <= 0 || caret > value.length) {
    return null;
  }

  const prefix = value.slice(0, caret);
  const trailingWhitespace = prefix.match(/\s+$/)?.[0] ?? '';
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
    before.endsWith(' ') && after.startsWith(' ') ? after.replace(/^\s+/, ' ') : after;

  return {
    value: `${before}${normalizedAfter}`,
    cursor: tokenStart,
  };
}
