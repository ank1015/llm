import { renderAlert, renderCard, renderCode, renderPill, renderTable } from '../components.js';
import {
  escapeHtml,
  formatCompactNumber,
  formatDate,
  formatNumber,
  formatRelative,
  formatUsd,
} from '../format.js';
import { renderShell } from '../layout.js';

import type { GatewayEnv } from '../../../context.js';
import type { RefreshTokenRecord, SenderRecord, UsageBreakdownRow } from '../../../db/index.js';
import type { Context } from 'hono';

type DashboardMessage = { kind: 'error' | 'info' | 'success'; text: string };

export function renderUsersPage(c: Context<GatewayEnv>, message?: DashboardMessage): string {
  const services = c.get('services');
  const db = services.db;

  const senders = db.listSenders();
  const usageBySender = new Map<string, UsageBreakdownRow>();
  for (const row of db.getUsageBreakdown({ by: 'senderId', limit: 200 })) {
    if (row.senderId) {
      usageBySender.set(row.senderId, row);
    }
  }

  const now = Date.now();
  const sessionsBySender = new Map<string, RefreshTokenRecord[]>();
  for (const sender of senders) {
    sessionsBySender.set(sender.id, db.listRefreshTokensBySender(sender.id));
  }

  const activeSessions = (sender: SenderRecord): number =>
    (sessionsBySender.get(sender.id) ?? []).filter(
      (token) => token.revokedAt === null && token.expiresAt > now
    ).length;

  const createPanel = renderCard({
    title: 'Create user',
    subtitle: 'User can call POST /v1/auth/login to receive tokens.',
    padded: true,
    body: `
      <form method="post" action="/admin/dashboard/users" class="form">
        <div class="field">
          <label for="new-name">Display name</label>
          <input id="new-name" name="name" placeholder="Test Pilot" />
        </div>
        <div class="field">
          <label for="new-username">Username</label>
          <input id="new-username" name="username" autocomplete="off" required />
        </div>
        <div class="field">
          <label for="new-password">Password</label>
          <input id="new-password" name="password" type="password" minlength="8" autocomplete="new-password" required />
        </div>
        <button class="btn btn-primary" type="submit">Create user</button>
      </form>
    `,
  });

  const rows = renderTable<SenderRecord>({
    empty: 'No users yet. Create one on the right to get started.',
    rows: senders,
    columns: [
      {
        head: 'Name',
        render: (sender) => escapeHtml(sender.name),
      },
      {
        head: 'Username',
        render: (sender) =>
          sender.username ? renderCode(sender.username) : `<span class="muted">sender only</span>`,
      },
      {
        head: 'Status',
        render: (sender) =>
          sender.disabledAt === null
            ? renderPill('enabled', 'ok')
            : renderPill('disabled', 'disabled'),
      },
      {
        head: 'Sessions',
        align: 'right',
        render: (sender) => {
          const active = activeSessions(sender);
          return active > 0
            ? renderPill(`${active} active`, 'info')
            : `<span class="muted">0</span>`;
        },
      },
      {
        head: 'Requests',
        align: 'right',
        render: (sender) => formatNumber(usageBySender.get(sender.id)?.requestCount ?? 0),
      },
      {
        head: 'Tokens',
        align: 'right',
        render: (sender) => formatCompactNumber(usageBySender.get(sender.id)?.totalTokens ?? 0),
      },
      {
        head: 'Cost',
        align: 'right',
        render: (sender) => formatUsd(usageBySender.get(sender.id)?.costUsd ?? 0),
      },
      {
        head: 'Last seen',
        render: (sender) => {
          const last = usageBySender.get(sender.id)?.lastStartedAt ?? null;
          return `<span class="muted">${escapeHtml(formatRelative(last))}</span>`;
        },
      },
      {
        head: 'Created',
        render: (sender) =>
          `<span class="muted">${escapeHtml(formatDate(sender.createdAt))}</span>`,
      },
      {
        head: 'Actions',
        render: (sender) => renderUserActions(sender),
      },
    ],
  });

  const usersPanel = renderCard({
    title: 'Users',
    subtitle: 'Only users created here can log in for access and refresh tokens.',
    padded: false,
    body: rows,
  });

  const sessionCards = senders
    .filter((sender) => (sessionsBySender.get(sender.id) ?? []).length > 0)
    .map((sender) => renderSessionsPanel(sender, sessionsBySender.get(sender.id) ?? []))
    .join('');

  return renderShell({
    active: 'users',
    title: 'Users',
    description: 'Manage approved users, sessions, and access.',
    body: `
      ${message ? renderAlert(message.kind, message.text) : ''}
      <section class="grid" style="grid-template-columns: minmax(0, 2fr) minmax(0, 1fr); gap: 1rem;">
        ${usersPanel}
        ${createPanel}
      </section>
      ${sessionCards}
    `,
  });
}

function renderUserActions(sender: SenderRecord): string {
  const enabled = sender.disabledAt === null;
  return `
    <div class="row" style="gap: 0.4rem; flex-wrap: nowrap; justify-content: flex-end;">
      <form method="post" action="/admin/dashboard/users/${encodeURIComponent(sender.id)}/${enabled ? 'disable' : 'enable'}">
        <button class="btn btn-xs${enabled ? '' : ' btn-primary'}" type="submit">${enabled ? 'Disable' : 'Enable'}</button>
      </form>
      <form method="post" action="/admin/dashboard/users/${encodeURIComponent(sender.id)}/revoke-sessions">
        <button class="btn btn-xs btn-destructive" type="submit">Revoke sessions</button>
      </form>
    </div>
  `;
}

function renderSessionsPanel(sender: SenderRecord, tokens: RefreshTokenRecord[]): string {
  const now = Date.now();
  const body = renderTable<RefreshTokenRecord>({
    empty: 'No sessions.',
    rows: tokens,
    columns: [
      {
        head: 'Session ID',
        render: (token) => renderCode(token.id.slice(0, 8)),
      },
      {
        head: 'Status',
        render: (token) => {
          if (token.revokedAt !== null) {
            return renderPill('revoked', 'disabled');
          }
          if (token.expiresAt <= now) {
            return renderPill('expired', 'disabled');
          }
          return renderPill('active', 'ok');
        },
      },
      {
        head: 'Issued',
        render: (token) =>
          `<span class="muted">${escapeHtml(formatRelative(token.issuedAt))}</span>`,
      },
      {
        head: 'Expires',
        render: (token) => `<span class="muted">${escapeHtml(formatDate(token.expiresAt))}</span>`,
      },
      {
        head: 'Revoked',
        render: (token) =>
          token.revokedAt !== null
            ? `<span class="muted">${escapeHtml(formatRelative(token.revokedAt))}</span>`
            : '<span class="muted">—</span>',
      },
    ],
  });

  return renderCard({
    title: `Sessions for ${sender.username ?? sender.name}`,
    subtitle: sender.id,
    padded: false,
    body,
  });
}
