export type ArtifactFilePathResolver = (raw: string) => string | null;

export type ArtifactFileTextSegment =
  | {
      type: "text";
      value: string;
    }
  | {
      type: "file-link";
      value: string;
      path: string;
    };

export type ResolvedArtifactFileMention = {
  leading: string;
  core: string;
  trailing: string;
  path: string;
};

const LEADING_PUNCTUATION = new Set(["(", "[", "{", "<", "\"", "'"]);
const TRAILING_PUNCTUATION = new Set([")", "]", "}", ">", ",", ".", ":", ";", "!", "?", "\"", "'"]);

export function normalizeRelativePath(path: string): string {
  return path.replace(/\\/g, "/").replace(/^\/+|\/+$/g, "").trim();
}

export function isLikelyExternalUrl(value: string): boolean {
  return /^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(value) || /^www\./i.test(value);
}

export function stripWrappingPunctuation(raw: string): {
  leading: string;
  core: string;
  trailing: string;
} {
  let leading = "";
  let trailing = "";
  let core = raw;

  while (core.length > 0 && LEADING_PUNCTUATION.has(core[0] ?? "")) {
    leading += core[0];
    core = core.slice(1);
  }

  while (core.length > 0 && TRAILING_PUNCTUATION.has(core[core.length - 1] ?? "")) {
    trailing = `${core[core.length - 1]}${trailing}`;
    core = core.slice(0, -1);
  }

  return { leading, core, trailing };
}

export function createArtifactFilePathResolver(options: {
  artifactId: string;
  filePaths: string[];
}): ArtifactFilePathResolver {
  const artifactId = normalizeRelativePath(options.artifactId);
  const filePathSet = new Set(
    options.filePaths
      .map((path) => normalizeRelativePath(path))
      .filter((path) => path.length > 0),
  );

  return (raw: string) => {
    const stripped = raw.trim();
    if (!stripped || isLikelyExternalUrl(stripped)) {
      return null;
    }

    let normalized = normalizeRelativePath(stripped.replace(/^\.\//, ""));
    if (!normalized) {
      return null;
    }

    if (artifactId && normalized.startsWith(`${artifactId}/`)) {
      normalized = normalized.slice(artifactId.length + 1);
    }

    return filePathSet.has(normalized) ? normalized : null;
  };
}

export function resolveArtifactFileMention(
  raw: string,
  resolve: ArtifactFilePathResolver,
): ResolvedArtifactFileMention | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const { leading, core, trailing } = stripWrappingPunctuation(trimmed);
  if (!core || isLikelyExternalUrl(core)) {
    return null;
  }

  const path = resolve(core);
  if (!path) {
    return null;
  }

  return {
    leading,
    core,
    trailing,
    path,
  };
}

export function linkifyArtifactFileText(
  text: string,
  resolve: ArtifactFilePathResolver,
): ArtifactFileTextSegment[] {
  if (!text) {
    return [];
  }

  const parts = text.split(/(\s+)/);
  const segments: ArtifactFileTextSegment[] = [];

  for (const part of parts) {
    if (!part) {
      continue;
    }

    if (/^\s+$/.test(part)) {
      segments.push({ type: "text", value: part });
      continue;
    }

    const resolvedMention = resolveArtifactFileMention(part, resolve);
    if (!resolvedMention) {
      segments.push({ type: "text", value: part });
      continue;
    }

    const { leading, core, trailing, path } = resolvedMention;

    if (leading) {
      segments.push({ type: "text", value: leading });
    }

    segments.push({
      type: "file-link",
      value: core,
      path,
    });

    if (trailing) {
      segments.push({ type: "text", value: trailing });
    }
  }

  return segments;
}
