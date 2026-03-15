'use client';

import { memo, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeKatex from 'rehype-katex';
import remarkBreaks from 'remark-breaks';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';

import { CodeBlockThemed } from './code-block-themed';

import type { ArtifactContext } from '@/lib/client-api';
import type { ReactNode } from 'react';
import type { Components } from 'react-markdown';

import { getArtifactRawFileUrl } from '@/lib/client-api';
import { cn } from '@/lib/utils';

type ArtifactMarkdownPreviewProps = {
  artifactCtx: ArtifactContext;
  filePath: string;
  children: string;
  className?: string;
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
  target: string
): string | null {
  const trimmedTarget = target.trim();
  if (!trimmedTarget || trimmedTarget.startsWith('#')) {
    return null;
  }

  if (EXTERNAL_LINK_RE.test(trimmedTarget) || EXTERNAL_IMAGE_RE.test(trimmedTarget)) {
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

function extractLanguage(className?: string): string {
  if (!className) return 'plaintext';
  const match = className.match(/language-([A-Za-z0-9_+-]+)/);
  return match ? match[1] : 'plaintext';
}

function stringifyNodeChildren(children: ReactNode): string {
  if (typeof children === 'string') {
    return children;
  }

  if (typeof children === 'number') {
    return `${children}`;
  }

  if (Array.isArray(children)) {
    return children.map((child) => stringifyNodeChildren(child)).join('');
  }

  return '';
}

function ArtifactMarkdownPreviewComponent({
  artifactCtx,
  filePath,
  children,
  className,
}: ArtifactMarkdownPreviewProps) {
  const components = useMemo<Partial<Components>>(
    () => ({
      h1: ({ children: content }) => (
        <h1 className="mt-0 mb-6 border-b border-home-border pb-3 text-4xl font-semibold tracking-tight">
          {content}
        </h1>
      ),
      h2: ({ children: content }) => (
        <h2 className="mt-10 mb-4 border-b border-home-border pb-2 text-3xl font-semibold tracking-tight">
          {content}
        </h2>
      ),
      h3: ({ children: content }) => (
        <h3 className="mt-8 mb-3 text-2xl font-semibold tracking-tight">{content}</h3>
      ),
      h4: ({ children: content }) => <h4 className="mt-6 mb-3 text-xl font-semibold">{content}</h4>,
      h5: ({ children: content }) => (
        <h5 className="mt-5 mb-2 text-lg font-semibold text-foreground/90">{content}</h5>
      ),
      h6: ({ children: content }) => (
        <h6 className="mt-4 mb-2 text-base font-semibold uppercase tracking-wide text-foreground/80">
          {content}
        </h6>
      ),
      p: ({ children: content }) => <p className="my-4 text-[15px] leading-7">{content}</p>,
      a: ({ href, children: content }) => {
        const targetHref = href?.trim() ?? '';
        if (!targetHref) {
          return <span>{content}</span>;
        }

        if (targetHref.startsWith('#')) {
          return (
            <a
              href={targetHref}
              className="font-medium text-sky-700 underline underline-offset-4 dark:text-sky-300"
            >
              {content}
            </a>
          );
        }

        if (GENERIC_PROTOCOL_RE.test(targetHref) && !EXTERNAL_LINK_RE.test(targetHref)) {
          return <span className="text-muted-foreground">{content}</span>;
        }

        const resolvedHref = resolveArtifactUrl(artifactCtx, filePath, targetHref) ?? targetHref;

        return (
          <a
            href={resolvedHref}
            target="_blank"
            rel="noreferrer noopener"
            className="font-medium text-sky-700 underline underline-offset-4 dark:text-sky-300"
          >
            {content}
          </a>
        );
      },
      blockquote: ({ children: content }) => (
        <blockquote className="my-6 rounded-r-xl border-l-4 border-l-sky-500 bg-home-panel/70 px-5 py-3 text-[15px] leading-7 text-muted-foreground">
          {content}
        </blockquote>
      ),
      ul: ({ children: content }) => <ul className="my-4 list-disc space-y-2 pl-6">{content}</ul>,
      ol: ({ children: content }) => (
        <ol className="my-4 list-decimal space-y-2 pl-6">{content}</ol>
      ),
      li: ({ children: content }) => <li className="text-[15px] leading-7">{content}</li>,
      hr: () => <hr className="my-8 border-home-border" />,
      table: ({ children: content }) => (
        <div className="my-6 overflow-x-auto rounded-xl border border-home-border bg-home-panel/40">
          <table className="w-full border-collapse text-left text-sm">{content}</table>
        </div>
      ),
      thead: ({ children: content }) => <thead className="bg-home-panel">{content}</thead>,
      tbody: ({ children: content }) => <tbody>{content}</tbody>,
      tr: ({ children: content }) => (
        <tr className="border-b border-home-border last:border-b-0">{content}</tr>
      ),
      th: ({ children: content }) => (
        <th className="px-4 py-2.5 font-semibold text-foreground">{content}</th>
      ),
      td: ({ children: content }) => <td className="px-4 py-2.5 align-top">{content}</td>,
      img: ({ src, alt }) => {
        const safeSrc = typeof src === 'string' ? src.trim() : '';
        if (!safeSrc) {
          return null;
        }

        if (GENERIC_PROTOCOL_RE.test(safeSrc) && !EXTERNAL_IMAGE_RE.test(safeSrc)) {
          return null;
        }

        const resolvedSrc = resolveArtifactUrl(artifactCtx, filePath, safeSrc) ?? safeSrc;

        return (
          <>
            {/* Artifact markdown can reference dynamic file URLs that are not suitable for next/image. */}
            { }
            <img
              src={resolvedSrc}
              alt={alt ?? ''}
              className="my-6 max-w-full rounded-xl border border-home-border shadow-sm"
            />
          </>
        );
      },
      input: ({ checked, disabled, type }) => {
        if (type !== 'checkbox') {
          return null;
        }

        return (
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled ?? true}
            readOnly
            className="mr-2 translate-y-[1px]"
          />
        );
      },
      code: function CodeComponent({ className, children: content, ...props }) {
        const isInline =
          !props.node?.position?.start.line ||
          props.node.position.start.line === props.node.position.end.line;

        if (isInline) {
          return (
            <code className="rounded-md border border-home-border bg-home-panel px-1.5 py-0.5 font-mono text-[0.9em]">
              {content}
            </code>
          );
        }

        return (
          <CodeBlockThemed
            code={stringifyNodeChildren(content).replace(/\n$/, '')}
            language={extractLanguage(className)}
          />
        );
      },
      pre: ({ children: content }) => <>{content}</>,
    }),
    [artifactCtx, filePath]
  );

  return (
    <div
      className={cn(
        'artifact-markdown-preview mx-auto w-full max-w-4xl text-foreground',
        'text-[15px] leading-7 [&_strong]:font-semibold [&_em]:italic',
        className
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks, remarkMath]}
        rehypePlugins={[rehypeKatex]}
        components={components}
      >
        {children}
      </ReactMarkdown>
    </div>
  );
}

export const ArtifactMarkdownPreview = memo(ArtifactMarkdownPreviewComponent);
ArtifactMarkdownPreview.displayName = 'ArtifactMarkdownPreview';
