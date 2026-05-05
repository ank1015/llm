import {
  renderAlert,
  renderCard,
  renderCode,
  renderEmpty,
  renderKv,
  renderStatusPill,
  renderTable,
} from '../components.js';
import {
  buildQueryString,
  parseRangeOption,
  RANGE_OPTIONS,
  rangeLabel,
  resolveRangeWindow,
} from '../filters.js';
import {
  escapeHtml,
  formatCompactNumber,
  formatDate,
  formatDuration,
  formatNumber,
  formatRelative,
  formatUsd,
  truncate,
} from '../format.js';
import { renderShell } from '../layout.js';

import type { GatewayEnv, GatewayRuntime } from '../../../context.js';
import type {
  GatewayDatabase,
  RequestEventRecord,
  RequestRecord,
  SenderRecord,
} from '../../../db/index.js';
import type { RangeOption } from '../filters.js';
import type { Context } from 'hono';

const PAGE_SIZE = 50;
const KIND_OPTIONS = ['llm', 'image'] as const;
const STATUS_OPTIONS = ['ok', 'error', 'aborted', 'running'] as const;

type Kind = (typeof KIND_OPTIONS)[number];
type StatusFilter = (typeof STATUS_OPTIONS)[number];

interface RequestsQuery {
  cursor?: number;
  kind?: Kind;
  range: RangeOption;
  senderId?: string;
  status?: StatusFilter;
}

export function renderRequestsListPage(
  c: Context<GatewayEnv>,
  query: Record<string, string | undefined>
): string {
  const services = c.get('services');
  const db = services.db;
  const parsed = parseRequestsQuery(query);
  const window = resolveRangeWindow(parsed.range);

  const { rows, hasMore } = fetchRequestsPage(db, parsed, window);
  const senderLookup = buildSenderLookup(db);
  const senders = db.listSenders();
  const tail = rows.length > 0 ? rows[rows.length - 1] : undefined;
  const nextCursor = hasMore && tail ? tail.startedAt - 1 : undefined;

  const tableBody = renderRequestsTable(rows, senderLookup);
  const filtersCard = renderCard({
    padded: true,
    body: renderFiltersForm(parsed, senders),
  });

  const paginationBase = {
    range: parsed.range,
    ...(parsed.senderId ? { senderId: parsed.senderId } : {}),
    ...(parsed.kind ? { kind: parsed.kind } : {}),
    ...(parsed.status ? { status: parsed.status } : {}),
  };

  const pagination = `
    <div class="row-between card-foot" style="border-top:0">
      <span class="muted">Showing ${formatNumber(rows.length)} request${rows.length === 1 ? '' : 's'}${parsed.cursor ? ` · page continues before ${formatDate(parsed.cursor)}` : ''}.</span>
      <div class="row">
        ${parsed.cursor ? `<a class="btn btn-sm" href="/admin/dashboard/requests${buildQueryString(paginationBase)}">Newest</a>` : ''}
        ${nextCursor ? `<a class="btn btn-sm" href="/admin/dashboard/requests${buildQueryString({ ...paginationBase, cursor: nextCursor })}">Older</a>` : ''}
      </div>
    </div>
  `;

  return renderShell({
    active: 'requests',
    title: 'Requests',
    description: `${rangeLabel(parsed.range)} · sanitized payloads`,
    body: `
      ${filtersCard}
      <section class="card">
        ${tableBody}
        ${rows.length > 0 ? pagination : ''}
      </section>
    `,
  });
}

interface RequestsPage {
  hasMore: boolean;
  rows: RequestRecord[];
}

function fetchRequestsPage(
  db: GatewayDatabase,
  parsed: RequestsQuery,
  window: { from?: number; to?: number }
): RequestsPage {
  const fetchLimit = parsed.status || parsed.kind ? 200 : PAGE_SIZE + 1;
  const toBound = parsed.cursor !== undefined ? parsed.cursor : window.to;
  const rawRows = db.listRequests({
    ...(window.from !== undefined ? { from: window.from } : {}),
    ...(toBound !== undefined ? { to: toBound } : {}),
    ...(parsed.senderId ? { senderId: parsed.senderId } : {}),
    limit: fetchLimit,
  });

  const filtered = rawRows.filter((row) => matchesFilters(row, parsed));
  const hasMore = filtered.length > PAGE_SIZE;
  const rows = hasMore ? filtered.slice(0, PAGE_SIZE) : filtered;

  return { rows, hasMore };
}

function matchesFilters(row: RequestRecord, parsed: RequestsQuery): boolean {
  if (parsed.status && row.status !== parsed.status) {
    return false;
  }
  if (parsed.kind && row.kind !== parsed.kind) {
    return false;
  }
  return true;
}

function renderRequestsTable(
  rows: RequestRecord[],
  senderLookup: Map<string, SenderRecord>
): string {
  return renderTable<RequestRecord>({
    empty: 'No requests matched these filters.',
    rows,
    rowAttributes: (row) =>
      `data-href="/admin/dashboard/requests/${encodeURIComponent(row.id)}" onclick="location.href=this.dataset.href" class="clickable"`,
    columns: [
      {
        head: 'Started',
        render: (row) => `<span class="muted">${escapeHtml(formatRelative(row.startedAt))}</span>`,
      },
      {
        head: 'Kind',
        render: (row) => `<span class="pill soft">${escapeHtml(row.kind)}</span>`,
      },
      {
        head: 'User',
        render: (row) =>
          escapeHtml(
            senderLabel(row.senderId ? senderLookup.get(row.senderId) : undefined, row.senderId)
          ),
      },
      {
        head: 'Model',
        render: (row) => renderCode(`${row.api}/${row.modelId}`),
      },
      {
        head: 'Status',
        render: (row) => renderStatusPill(row.status),
      },
      {
        head: 'Duration',
        align: 'right',
        render: (row) =>
          row.endedAt !== null
            ? escapeHtml(formatDuration(row.endedAt - row.startedAt))
            : '<span class="muted">—</span>',
      },
      {
        head: 'Tokens',
        align: 'right',
        render: (row) => formatCompactNumber(row.totalTokens ?? 0),
      },
      {
        head: 'Cost',
        align: 'right',
        render: (row) => formatUsd(row.costUsd ?? 0),
      },
      {
        head: 'ID',
        render: (row) => renderCode(row.id.slice(0, 8)),
      },
    ],
  });
}

function renderFiltersForm(query: RequestsQuery, senders: SenderRecord[]): string {
  const senderOptions = senders
    .map(
      (sender) =>
        `<option value="${escapeHtml(sender.id)}"${sender.id === query.senderId ? ' selected' : ''}>${escapeHtml(sender.username ?? sender.name)}</option>`
    )
    .join('');

  return `
    <form method="get" action="/admin/dashboard/requests" class="grid" style="grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 0.85rem;">
      <div class="field">
        <label for="f-range">Range</label>
        <select id="f-range" name="range">
          ${RANGE_OPTIONS.map(
            (option) =>
              `<option value="${option}"${option === query.range ? ' selected' : ''}>${escapeHtml(rangeLabel(option))}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field">
        <label for="f-status">Status</label>
        <select id="f-status" name="status">
          <option value="">Any</option>
          ${STATUS_OPTIONS.map(
            (option) =>
              `<option value="${option}"${option === query.status ? ' selected' : ''}>${escapeHtml(option)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field">
        <label for="f-kind">Kind</label>
        <select id="f-kind" name="kind">
          <option value="">Any</option>
          ${KIND_OPTIONS.map(
            (option) =>
              `<option value="${option}"${option === query.kind ? ' selected' : ''}>${escapeHtml(option)}</option>`
          ).join('')}
        </select>
      </div>
      <div class="field">
        <label for="f-sender">User</label>
        <select id="f-sender" name="senderId">
          <option value="">Any</option>
          ${senderOptions}
        </select>
      </div>
      <div class="row" style="grid-column: 1 / -1; justify-content: flex-end;">
        <a class="btn btn-sm btn-ghost" href="/admin/dashboard/requests">Reset</a>
        <button class="btn btn-sm btn-primary" type="submit">Apply filters</button>
      </div>
    </form>
  `;
}

function parseRequestsQuery(query: Record<string, string | undefined>): RequestsQuery {
  const status = query['status']?.trim();
  const kind = query['kind']?.trim();
  const cursorRaw = query['cursor'];
  const cursor = cursorRaw ? Number.parseInt(cursorRaw, 10) : undefined;

  return {
    range: parseRangeOption(query['range']),
    ...(query['senderId']?.trim() ? { senderId: query['senderId']!.trim() } : {}),
    ...(isStatus(status) ? { status } : {}),
    ...(isKind(kind) ? { kind } : {}),
    ...(cursor && Number.isFinite(cursor) ? { cursor } : {}),
  };
}

function isStatus(value: string | undefined): value is StatusFilter {
  return !!value && (STATUS_OPTIONS as readonly string[]).includes(value);
}

function isKind(value: string | undefined): value is Kind {
  return !!value && (KIND_OPTIONS as readonly string[]).includes(value);
}

function buildSenderLookup(db: GatewayDatabase): Map<string, SenderRecord> {
  const lookup = new Map<string, SenderRecord>();
  for (const sender of db.listSenders()) {
    lookup.set(sender.id, sender);
  }
  return lookup;
}

function renderUserCell(senderId: string | null, sender: SenderRecord | undefined): string {
  if (sender) {
    return `${escapeHtml(sender.username ?? sender.name)} <span class="muted">(${escapeHtml(sender.id.slice(0, 8))})</span>`;
  }
  if (!senderId) {
    return '<span class="muted">(deleted user)</span>';
  }
  return `<span class="muted">${escapeHtml(senderId.slice(0, 8))}</span>`;
}

function senderLabel(record: SenderRecord | undefined, senderId: string | null): string {
  if (record) {
    return record.username ?? record.name;
  }
  if (!senderId) {
    return '(deleted user)';
  }
  return senderId.slice(0, 8);
}

export function renderRequestDetailPage(
  c: Context<GatewayEnv>,
  requestId: string
): { html: string; status: number } {
  const services = c.get('services');
  const result = services.db.getRequestById(requestId);
  if (!result) {
    return {
      status: 404,
      html: renderShell({
        active: 'requests',
        title: 'Request not found',
        description: 'That request id does not exist.',
        body: renderEmpty('No request with that id.'),
      }),
    };
  }

  const { request, events } = result;
  const sender = request.senderId ? services.db.getSenderById(request.senderId) : undefined;
  const duration = request.endedAt !== null ? request.endedAt - request.startedAt : null;
  const logMode = services.config.logMode;

  const input = parseStoredJson(request.inputJson);
  const output = parseStoredJson(request.outputJson);
  const modelName = resolveModelName(services.runtime, request);

  const summary = renderCard({
    padded: true,
    title: 'Summary',
    tools: renderStatusPill(request.status),
    body: renderKv(buildSummaryRows(request, sender, duration)),
  });

  const logModeNotice =
    logMode === 'full'
      ? ''
      : renderAlert(
          'warning',
          `GATEWAY_LOG_MODE is "${logMode}". Input, output, and stream events are not persisted in this mode.`
        );

  const inputCard = renderCard({
    title: 'Input',
    subtitle: 'Sanitized: provider credentials and base64 payloads redacted.',
    padded: true,
    body:
      input === null
        ? `<p class="muted">Input payload not stored in this log mode.</p>`
        : renderInputPayload(request, input, modelName),
  });

  const outputCard = renderCard({
    title: 'Output',
    subtitle: 'Sanitized assistant response or image result.',
    padded: true,
    body:
      output === null
        ? `<p class="muted">Output payload not stored or not available for this request.</p>`
        : renderOutputPayload(request, output, modelName),
  });

  const eventsCard = renderCard({
    title: 'Stream events',
    subtitle: events.length > 0 ? `${events.length} events received` : 'None captured',
    padded: true,
    body: renderEventList(events, services.config.logEvents),
  });

  return {
    status: 200,
    html: renderShell({
      active: 'requests',
      title: `Request ${request.id.slice(0, 8)}`,
      description: `${request.kind} · ${request.api}/${request.modelId}`,
      toolbar: `<a class="btn btn-sm" href="/admin/dashboard/requests">← Back to requests</a>`,
      body: `
        ${logModeNotice}
        ${summary}
        <section class="grid grid-2">
          ${inputCard}
          ${outputCard}
        </section>
        ${eventsCard}
      `,
    }),
  };
}

function buildSummaryRows(
  request: RequestRecord,
  sender: SenderRecord | undefined,
  duration: number | null
): Array<[string, string]> {
  const rows: Array<[string, string]> = [['Request ID', renderCode(request.id)]];

  if (request.clientRequestId) {
    rows.push(['Client request ID', renderCode(request.clientRequestId)]);
  }

  rows.push(
    ['User', renderUserCell(request.senderId, sender)],
    ['Kind', `<span class="pill soft">${escapeHtml(request.kind)}</span>`],
    ['Provider · Model', renderCode(`${request.api}/${request.modelId}`)],
    ['Started', escapeHtml(formatDate(request.startedAt))],
    ['Duration', escapeHtml(formatDuration(duration))],
    [
      'Tokens',
      `<span title="input ${formatNumber(request.inputTokens ?? 0)} · output ${formatNumber(request.outputTokens ?? 0)}">${formatCompactNumber(request.totalTokens ?? 0)}</span>`,
    ],
    ['Cost', escapeHtml(formatUsd(request.costUsd ?? 0))]
  );

  if (request.errorCode) {
    rows.push([
      'Error code',
      `<span class="pill pill-error">${escapeHtml(request.errorCode)}</span>`,
    ]);
  }

  if (request.errorMessage) {
    rows.push(['Error message', `<code>${escapeHtml(truncate(request.errorMessage, 200))}</code>`]);
  }

  return rows;
}

function renderJsonDetails(value: unknown): string {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
  return `<details class="json" open><summary>JSON payload</summary><pre>${escapeHtml(text)}</pre></details>`;
}

function renderInputPayload(request: RequestRecord, input: unknown, modelName: string): string {
  const payload = asRecord(input);
  if (!payload) {
    return renderJsonDetails(input);
  }

  const providerOptions = payload['providerOptions'];
  const messages = Array.isArray(payload['messages']) ? payload['messages'] : undefined;
  const sections = [
    renderPanel(
      'Request metadata',
      renderKv([
        ['Gateway request ID', renderCode(request.id)],
        [
          'Request ID',
          renderCode(readString(payload['requestId']) ?? request.clientRequestId ?? '—'),
        ],
        ['API', renderCode(readString(payload['api']) ?? request.api)],
        ['Model', renderCode(modelName)],
        ['Model ID', renderCode(readString(payload['modelId']) ?? request.modelId)],
      ]),
      true
    ),
    renderPanel('Provider settings', renderUnknownObject(providerOptions), true),
  ];

  if (messages) {
    sections.push(renderMarkdownPanel('Messages', renderMessagesMarkdown(messages), true));
  } else if (request.kind === 'image') {
    sections.push(renderMarkdownPanel('Prompt', readString(payload['prompt']) ?? '', true));
    sections.push(
      renderPanel(
        'Image inputs',
        renderKv([
          [
            'Images',
            renderCode(String(Array.isArray(payload['images']) ? payload['images'].length : 0)),
          ],
          ['Mask', renderCode(payload['mask'] ? 'yes' : 'no')],
        ])
      )
    );
  } else {
    sections.push(renderPanel('Payload', renderJsonDetails(input)));
  }

  if (readString(payload['systemPrompt'])) {
    sections.push(renderMarkdownPanel('System prompt', readString(payload['systemPrompt']) ?? ''));
  }

  if (Array.isArray(payload['tools'])) {
    sections.push(renderPanel('Tools', renderUnknownObject(payload['tools'])));
  }

  return `<div class="payload-stack">${sections.join('')}</div>`;
}

function renderOutputPayload(request: RequestRecord, output: unknown, modelName: string): string {
  const payload = asRecord(output);
  if (!payload) {
    return renderJsonDetails(output);
  }

  const usage = asRecord(payload['usage']);
  const model = asRecord(payload['model']);
  const modelId = readString(model?.['id']) ?? request.modelId;
  const api = readString(payload['api']) ?? readString(model?.['api']) ?? request.api;
  const outputModelName = readString(model?.['name']) ?? modelName;
  const sections = [
    renderPanel(
      'Response metadata',
      renderKv([
        ['API', renderCode(api)],
        ['Model', renderCode(outputModelName)],
        ['Model ID', renderCode(modelId)],
        ['Message ID', renderCode(readString(payload['id']) ?? '—')],
        ['Stop reason', renderCode(readString(payload['stopReason']) ?? request.status)],
      ]),
      true
    ),
  ];

  if (Array.isArray(payload['content'])) {
    sections.push(renderMarkdownPanel('Message', renderAssistantMarkdown(payload), true));
  } else if (request.kind === 'image') {
    sections.push(renderPanel('Image result', renderImageOutputSummary(payload), true));
  } else {
    sections.push(renderPanel('Payload', renderJsonDetails(output), true));
  }

  sections.push(renderPanel('Usage', renderUsage(usage, request), true));

  return `<div class="payload-stack">${sections.join('')}</div>`;
}

function resolveModelName(runtime: GatewayRuntime, request: RequestRecord): string {
  if (request.kind === 'image') {
    return (
      runtime.getImageModel(request.api as never, request.modelId as never)?.name ?? request.modelId
    );
  }

  return runtime.getModel(request.api as never, request.modelId as never)?.name ?? request.modelId;
}

function renderPanel(title: string, body: string, open = false): string {
  return `
    <details class="payload-panel"${open ? ' open' : ''}>
      <summary>${escapeHtml(title)}</summary>
      <div class="payload-panel-body">${body}</div>
    </details>
  `;
}

function renderMarkdownPanel(title: string, markdown: string, open = false): string {
  const value = markdown.trim();
  return renderPanel(
    title,
    value.length > 0
      ? `<pre class="markdown-view">${escapeHtml(value)}</pre>`
      : `<p class="muted">No text content.</p>`,
    open
  );
}

function renderUnknownObject(value: unknown): string {
  if (value === undefined || value === null) {
    return '<p class="muted">No provider settings supplied.</p>';
  }

  return renderJsonDetails(value);
}

function renderMessagesMarkdown(messages: unknown[]): string {
  return messages
    .map((message) => renderMessageMarkdown(message))
    .join('\n\n')
    .trim();
}

function renderMessageMarkdown(message: unknown): string {
  const record = asRecord(message);
  const role = readString(record?.['role']);

  if (role === 'user') {
    return `# User\n\n${renderContentBlocks(record?.['content'])}`.trim();
  }

  if (role === 'assistant' && record) {
    return renderAssistantMarkdown(record);
  }

  if (role === 'toolResult' && record) {
    return renderToolResultMarkdown(record);
  }

  if (role === 'custom' && record) {
    return `# Custom\n\n${renderJsonBlock(record['content'])}`;
  }

  return `# Message\n\n${renderJsonBlock(message)}`;
}

function renderAssistantMarkdown(message: Record<string, unknown>): string {
  const parts = ['# Assistant'];
  const content = Array.isArray(message['content']) ? message['content'] : [];

  for (const item of content) {
    const renderedBlock = renderAssistantContentBlock(item);
    if (renderedBlock) {
      parts.push(renderedBlock);
    }
  }

  const error = asRecord(message['error']);
  const errorMessage = readString(error?.['message']) ?? readString(message['errorMessage']);
  if (errorMessage) {
    parts.push(`## Error\n\n${errorMessage}`);
  }

  return parts.join('\n\n').trim();
}

function renderAssistantContentBlock(item: unknown): string | undefined {
  const block = asRecord(item);
  const type = readString(block?.['type']);
  if (!block || !type) {
    return undefined;
  }

  if (type === 'thinking') {
    const thinking = readString(block['thinkingText']);
    return thinking ? `## Thinking\n\n${thinking}` : undefined;
  }

  if (type === 'toolCall') {
    return [
      `## Tool Call${readString(block['name']) ? `: ${readString(block['name'])}` : ''}`,
      '',
      `Call ID: ${readString(block['toolCallId']) ?? '—'}`,
      '',
      'Arguments:',
      renderJsonBlock(block['arguments'] ?? {}),
    ].join('\n');
  }

  if (type === 'response') {
    return renderContentBlocks(block['response']) || undefined;
  }

  return undefined;
}

function renderToolResultMarkdown(message: Record<string, unknown>): string {
  const parts = [
    '# Tool Result',
    `Tool: ${readString(message['toolName']) ?? '—'}`,
    `Call ID: ${readString(message['toolCallId']) ?? '—'}`,
    `Status: ${message['isError'] ? 'error' : 'ok'}`,
  ];
  const content = renderContentBlocks(message['content']);
  if (content) {
    parts.push(content);
  }
  if (message['details'] !== undefined) {
    parts.push(`## Details\n\n${renderJsonBlock(message['details'])}`);
  }
  const error = asRecord(message['error']);
  if (error) {
    parts.push(`## Error\n\n${renderJsonBlock(error)}`);
  }
  return parts.join('\n\n').trim();
}

function renderContentBlocks(content: unknown): string {
  if (!Array.isArray(content)) {
    return '';
  }

  return content
    .map((item) => {
      const block = asRecord(item);
      const type = readString(block?.['type']);
      if (!block || !type) {
        return '';
      }

      if (type === 'text') {
        return readString(block['content']) ?? '';
      }

      if (type === 'image') {
        const label = readMetadataLabel(block['metadata']) ?? 'image';
        return `[Image: ${label}${readString(block['mimeType']) ? `, ${readString(block['mimeType'])}` : ''}]`;
      }

      if (type === 'file') {
        const filename =
          readString(block['filename']) ?? readMetadataLabel(block['metadata']) ?? 'file';
        return `[File: ${filename}${readString(block['mimeType']) ? `, ${readString(block['mimeType'])}` : ''}]`;
      }

      return renderJsonBlock(block);
    })
    .filter((item) => item.trim().length > 0)
    .join('\n\n')
    .trim();
}

function renderImageOutputSummary(payload: Record<string, unknown>): string {
  const response = asRecord(payload['response']);
  const images = Array.isArray(response?.['images']) ? response['images'] : undefined;
  return renderKv([
    ['Result ID', renderCode(readString(payload['id']) ?? '—')],
    ['Images', renderCode(String(images?.length ?? 0))],
  ]);
}

function renderUsage(usage: Record<string, unknown> | null, request: RequestRecord): string {
  const cost = asRecord(usage?.['cost']);
  return renderKv([
    [
      'Input tokens',
      renderCode(formatNumber(readNumber(usage?.['input']) ?? request.inputTokens ?? 0)),
    ],
    [
      'Output tokens',
      renderCode(formatNumber(readNumber(usage?.['output']) ?? request.outputTokens ?? 0)),
    ],
    ['Cache read', renderCode(formatNumber(readNumber(usage?.['cacheRead']) ?? 0))],
    ['Cache write', renderCode(formatNumber(readNumber(usage?.['cacheWrite']) ?? 0))],
    [
      'Total tokens',
      renderCode(formatNumber(readNumber(usage?.['totalTokens']) ?? request.totalTokens ?? 0)),
    ],
    ['Cost', renderCode(formatUsd(readNumber(cost?.['total']) ?? request.costUsd ?? 0))],
  ]);
}

function renderJsonBlock(value: unknown): string {
  return wrapCodeBlock(JSON.stringify(value, null, 2) ?? 'null', 'json');
}

function wrapCodeBlock(text: string, language: string): string {
  const fence = text.includes('```') ? '````' : '```';
  return `${fence}${language}\n${text}\n${fence}`;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function readMetadataLabel(value: unknown): string | undefined {
  const metadata = asRecord(value);
  return (
    readString(metadata?.['originalFileName']) ??
    readString(metadata?.['fileName']) ??
    readString(metadata?.['filename'])
  );
}

function parseStoredJson(value: string | null): unknown {
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as unknown;
  } catch {
    return value;
  }
}

function renderEventList(events: RequestEventRecord[], logEvents: boolean): string {
  if (events.length === 0) {
    const reason = logEvents
      ? 'This can happen for non-streaming requests, or when GATEWAY_LOG_MODE is not "full".'
      : 'GATEWAY_LOG_EVENTS is false, so input/output payloads can be stored without per-event stream logs.';
    return `<p class="muted">No stream events captured. ${escapeHtml(reason)}</p>`;
  }

  const items = events
    .map((event) => {
      const parsed = parseStoredJson(event.eventJson) as { type?: string } | string | null;
      const type =
        typeof parsed === 'object' && parsed !== null && typeof parsed.type === 'string'
          ? parsed.type
          : 'event';
      const raw = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
      return `
        <details class="event-item" style="display:block; padding:0; border:1px solid var(--border); border-radius: var(--radius-sm); background: var(--background);">
          <summary style="display:grid; grid-template-columns: 7.5rem 6.5rem minmax(0, 1fr) auto; gap:0.75rem; align-items:center; padding: 0.55rem 0.85rem; cursor: pointer;">
            <span class="event-time">${escapeHtml(formatRelative(event.timestamp))}</span>
            <span class="pill soft">${escapeHtml(type)}</span>
            <span class="event-body">${escapeHtml(truncate(raw, 120))}</span>
            <span class="muted">#${event.seq}</span>
          </summary>
          <pre style="margin:0; border-radius: 0 0 var(--radius-sm) var(--radius-sm); border-top:1px solid var(--border);">${escapeHtml(typeof parsed === 'string' ? parsed : JSON.stringify(parsed, null, 2))}</pre>
        </details>
      `;
    })
    .join('');

  return `<div class="event-list">${items}</div>`;
}
