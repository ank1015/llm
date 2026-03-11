import type { ArtifactContext } from '@/lib/client-api';

import { ThreadMarkdown } from '@/components/projects/thread/thread-markdown';
import { getArtifactRawFileUrl } from '@/lib/client-api';


type ArtifactMarkdownPreviewProps = {
  artifactCtx: ArtifactContext;
  children: string;
  compact?: boolean;
  filePath: string;
};

const GENERIC_PROTOCOL_RE = /^[a-zA-Z][a-zA-Z\d+.-]*:/;
const EXTERNAL_LINK_RE = /^(https?:|mailto:|tel:)/i;
const EXTERNAL_IMAGE_RE = /^(https?:|data:image\/)/i;

function normalizeArtifactPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function getParentDirectory(path: string): string {
  const safePath = normalizeArtifactPath(path);
  const slashIndex = safePath.lastIndexOf('/');

  if (slashIndex === -1) {
    return '';
  }

  return safePath.slice(0, slashIndex);
}

function resolveArtifactPath(baseFilePath: string, target: string): string | null {
  const trimmedTarget = target.trim();
  if (!trimmedTarget || trimmedTarget.startsWith('#') || GENERIC_PROTOCOL_RE.test(trimmedTarget)) {
    return null;
  }

  const match = /^(.*?)([?#].*)?$/.exec(trimmedTarget);
  const pathPart = match?.[1] ?? trimmedTarget;
  const segments = pathPart.startsWith('/')
    ? []
    : getParentDirectory(baseFilePath).split('/').filter(Boolean);

  for (const segment of pathPart.split('/')) {
    if (!segment || segment === '.') {
      continue;
    }

    if (segment === '..') {
      segments.pop();
      continue;
    }

    segments.push(segment);
  }

  return normalizeArtifactPath(segments.join('/'));
}

function resolveArtifactUrl(
  artifactCtx: ArtifactContext,
  baseFilePath: string,
  target: string,
  kind: 'link' | 'image'
): string | null {
  const trimmedTarget = target.trim();
  if (!trimmedTarget || trimmedTarget.startsWith('#')) {
    return null;
  }

  if (kind === 'link' && EXTERNAL_LINK_RE.test(trimmedTarget)) {
    return trimmedTarget;
  }

  if (kind === 'image' && EXTERNAL_IMAGE_RE.test(trimmedTarget)) {
    return trimmedTarget;
  }

  if (GENERIC_PROTOCOL_RE.test(trimmedTarget)) {
    return null;
  }

  const match = /^(.*?)([?#].*)?$/.exec(trimmedTarget);
  const suffix = match?.[2] ?? '';
  const resolvedPath = resolveArtifactPath(baseFilePath, trimmedTarget);

  if (!resolvedPath) {
    return null;
  }

  return `${getArtifactRawFileUrl(artifactCtx, { path: resolvedPath })}${suffix}`;
}

export function ArtifactMarkdownPreview({
  artifactCtx,
  children,
  compact = false,
  filePath,
}: ArtifactMarkdownPreviewProps) {
  return (
    <ThreadMarkdown
      compact={compact}
      resolveImageSource={(source) => resolveArtifactUrl(artifactCtx, filePath, source, 'image')}
      resolveLinkHref={(href) => resolveArtifactUrl(artifactCtx, filePath, href, 'link')}
    >
      {children}
    </ThreadMarkdown>
  );
}
