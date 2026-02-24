/** Matches server's ProjectMetadata */
export type ProjectMetadata = {
  id: string;
  name: string;
  description: string | null;
  projectPath: string;
  createdAt: string;
};

/** Matches server's ArtifactDirMetadata */
export type ArtifactDirMetadata = {
  id: string;
  name: string;
  description: string | null;
  createdAt: string;
};

/** Matches server's SessionSummary from Session.list() */
export type SessionSummary = {
  sessionId: string;
  sessionName: string;
  filePath: string;
  createdAt: string;
  updatedAt: string;
  nodeCount: number;
  branches: string[];
};

/** Matches server's SessionMetadata from Session.getMetadata() */
export type SessionMetadata = {
  id: string;
  name: string;
  api: string;
  modelId: string;
  createdAt: string;
};

/** Simplified message for UI display */
export type DisplayMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

/** Input for creating a project */
export type CreateProjectInput = {
  name: string;
  description?: string;
};

/** Input for creating an artifact directory */
export type CreateArtifactDirInput = {
  name: string;
  description?: string;
};

/** Input for creating a session */
export type CreateSessionInput = {
  name?: string;
  modelId: string;
  api: string;
};

/** Input for prompting a session */
export type PromptInput = {
  message: string;
};

// ---------------------------------------------------------------------------
// Message extraction utilities
// ---------------------------------------------------------------------------

type RawContentItem = { type?: string; content?: string | unknown[] };
type RawAssistantBlock = { type?: string; content?: unknown[] };

function extractUserText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return (content as RawContentItem[])
    .filter((c) => c.type === 'text' && typeof c.content === 'string')
    .map((c) => c.content as string)
    .join('');
}

function extractAssistantText(content: unknown): string {
  if (!Array.isArray(content)) return '';
  return (content as RawAssistantBlock[])
    .filter((block) => block.type === 'response' && Array.isArray(block.content))
    .flatMap((block) =>
      (block.content as RawContentItem[])
        .filter((c) => c.type === 'text' && typeof c.content === 'string')
        .map((c) => c.content as string)
    )
    .join('');
}

/** Convert raw SDK messages from the API into display-friendly messages */
export function toDisplayMessages(raw: unknown[]): DisplayMessage[] {
  const result: DisplayMessage[] = [];

  for (const msg of raw) {
    if (typeof msg !== 'object' || msg === null) continue;
    const m = msg as Record<string, unknown>;

    if (m.role === 'user' && typeof m.id === 'string') {
      const text = extractUserText(m.content);
      if (text) {
        result.push({ id: m.id, role: 'user', content: text });
      }
    } else if (m.role === 'assistant' && typeof m.id === 'string') {
      const text = extractAssistantText(m.content);
      if (text) {
        result.push({ id: m.id, role: 'assistant', content: text });
      }
    }
  }

  return result;
}

/** Convert an ISO timestamp to a short relative time string (e.g. "2d", "1w") */
export function relativeTime(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();

  const minutes = Math.floor(diff / 60_000);
  const hours = Math.floor(diff / 3_600_000);
  const days = Math.floor(diff / 86_400_000);
  const weeks = Math.floor(days / 7);

  if (minutes < 1) return 'now';
  if (hours < 1) return `${minutes}m`;
  if (days < 1) return `${hours}h`;
  if (weeks < 1) return `${days}d`;
  return `${weeks}w`;
}
