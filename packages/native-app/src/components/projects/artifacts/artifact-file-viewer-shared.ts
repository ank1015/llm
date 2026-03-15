export type ArtifactViewerKind =
  | 'code'
  | 'markdown'
  | 'csv'
  | 'image'
  | 'pdf'
  | 'audio'
  | 'video'
  | 'text'
  | 'binary';

export type ArtifactFileViewerTheme = {
  background: string;
  border: string;
  foreground: string;
  hover: string;
  isDark: boolean;
  link: string;
  muted: string;
  panel: string;
};

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'ico']);
const PDF_EXTENSIONS = new Set(['pdf']);
const AUDIO_EXTENSIONS = new Set(['mp3', 'wav', 'ogg', 'm4a', 'aac', 'flac']);
const VIDEO_EXTENSIONS = new Set(['mp4', 'webm', 'mov', 'mkv']);
const CSV_EXTENSIONS = new Set(['csv', 'tsv']);
const MARKDOWN_EXTENSIONS = new Set(['md', 'markdown', 'mdx']);
const CODE_EXTENSIONS = new Set([
  'ts',
  'tsx',
  'js',
  'jsx',
  'json',
  'py',
  'go',
  'rs',
  'java',
  'kt',
  'rb',
  'php',
  'swift',
  'c',
  'h',
  'cpp',
  'hpp',
  'cs',
  'sh',
  'bash',
  'zsh',
  'yaml',
  'yml',
  'toml',
  'xml',
  'html',
  'css',
  'scss',
  'sql',
  'graphql',
  'proto',
  'ini',
  'env',
]);

export function normalizeRelativePath(path: string | null | undefined): string {
  if (typeof path !== 'string') {
    return '';
  }

  return path
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

export function getPathBasename(path: string): string {
  const safePath = normalizeRelativePath(path);
  const segments = safePath.split('/');
  return segments[segments.length - 1] ?? safePath;
}

export function getPathExtension(path: string): string {
  const basename = getPathBasename(path);
  const lastDotIndex = basename.lastIndexOf('.');

  if (lastDotIndex <= 0) {
    return '';
  }

  return basename.slice(lastDotIndex + 1).toLowerCase();
}

export function getViewerKind(path: string, isBinary: boolean): ArtifactViewerKind {
  const extension = getPathExtension(path);

  if (IMAGE_EXTENSIONS.has(extension)) return 'image';
  if (PDF_EXTENSIONS.has(extension)) return 'pdf';
  if (AUDIO_EXTENSIONS.has(extension)) return 'audio';
  if (VIDEO_EXTENSIONS.has(extension)) return 'video';
  if (CSV_EXTENSIONS.has(extension)) return 'csv';
  if (MARKDOWN_EXTENSIONS.has(extension)) return 'markdown';
  if (CODE_EXTENSIONS.has(extension)) return 'code';
  if (isBinary) return 'binary';
  return 'text';
}

export function resolveMonacoLanguage(path: string): string {
  const extension = getPathExtension(path);

  if (!extension) return 'plaintext';
  if (extension === 'tsx') return 'tsx';
  if (extension === 'ts') return 'typescript';
  if (extension === 'jsx') return 'javascript';
  if (extension === 'js') return 'javascript';
  if (extension === 'json') return 'json';
  if (extension === 'md' || extension === 'markdown' || extension === 'mdx') return 'markdown';
  if (extension === 'yml') return 'yaml';
  if (extension === 'py') return 'python';
  if (extension === 'rs') return 'rust';
  if (extension === 'kt') return 'kotlin';
  if (extension === 'rb') return 'ruby';
  if (extension === 'cpp' || extension === 'hpp' || extension === 'h') return 'cpp';
  if (extension === 'c') return 'c';
  if (extension === 'cs') return 'csharp';
  if (extension === 'go') return 'go';
  if (extension === 'toml') return 'ini';
  if (extension === 'xml' || extension === 'svg') return 'xml';
  if (extension === 'sql') return 'sql';
  if (extension === 'graphql') return 'graphql';
  if (extension === 'proto') return 'protobuf';
  if (extension === 'sh' || extension === 'bash' || extension === 'zsh') return 'shell';
  if (extension === 'env') return 'ini';

  return extension;
}

export function buildRawArtifactFileUrl(artifactFileBaseUrl: string, path: string): string {
  const params = new URLSearchParams({ path: normalizeRelativePath(path) });
  return `${artifactFileBaseUrl}?${params.toString()}`;
}
