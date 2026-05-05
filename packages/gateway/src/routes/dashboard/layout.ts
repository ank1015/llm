import { escapeHtml } from './format.js';

export type NavKey = 'overview' | 'providers' | 'requests' | 'users';

export interface NavItem {
  href: string;
  key: NavKey;
  label: string;
}

export const NAV_ITEMS: NavItem[] = [
  { key: 'overview', label: 'Overview', href: '/admin/dashboard' },
  { key: 'requests', label: 'Requests', href: '/admin/dashboard/requests' },
  { key: 'users', label: 'Users', href: '/admin/dashboard/users' },
  { key: 'providers', label: 'Providers', href: '/admin/dashboard/providers' },
];

export interface ShellInput {
  active: NavKey;
  body: string;
  description?: string;
  title: string;
  toolbar?: string;
}

export function renderShell(input: ShellInput): string {
  return renderPageHtml({
    title: `${input.title} · LLM Gateway`,
    body: `
      <div class="app">
        <aside class="sidebar">
          <div class="sidebar-inner">
            <a class="brand" href="/admin/dashboard">
              <span class="brand-mark" aria-hidden="true">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M4 12h10"/><path d="M4 17h16"/></svg>
              </span>
              <span class="brand-text">LLM Gateway</span>
            </a>
            <nav class="nav">
              ${NAV_ITEMS.map(
                (item) =>
                  `<a class="nav-item${input.active === item.key ? ' is-active' : ''}" href="${item.href}">${escapeHtml(item.label)}</a>`
              ).join('')}
            </nav>
          </div>
          <form method="post" action="/admin/logout" class="sidebar-foot">
            <button class="btn btn-ghost btn-full" type="submit">Log out</button>
          </form>
        </aside>
        <main class="content">
          <header class="page-head">
            <div class="page-head-main">
              <h1>${escapeHtml(input.title)}</h1>
              ${input.description ? `<p class="muted">${escapeHtml(input.description)}</p>` : ''}
            </div>
            ${input.toolbar ? `<div class="page-head-tools">${input.toolbar}</div>` : ''}
          </header>
          <section class="page-body">
            ${input.body}
          </section>
        </main>
      </div>
    `,
  });
}

export interface MinimalPageInput {
  body: string;
  title: string;
}

export function renderMinimalPage(input: MinimalPageInput): string {
  return renderPageHtml({
    title: input.title,
    body: input.body,
  });
}

function renderPageHtml(input: { body: string; title: string }): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="color-scheme" content="light" />
  <title>${input.title}</title>
  <style>${BASE_STYLES}</style>
</head>
<body>
${input.body}
</body>
</html>`;
}

const BASE_STYLES = `
  :root {
    color-scheme: light;
    --background: #ffffff;
    --foreground: #09090b;
    --muted: #f4f4f5;
    --muted-foreground: #71717a;
    --subtle: #fafafa;
    --border: #e4e4e7;
    --border-strong: #d4d4d8;
    --input: #e4e4e7;
    --ring: #09090b;
    --primary: #18181b;
    --primary-hover: #27272a;
    --primary-foreground: #fafafa;
    --secondary: #f4f4f5;
    --secondary-foreground: #18181b;
    --accent: #f4f4f5;
    --destructive: #b91c1c;
    --destructive-soft: #fef2f2;
    --destructive-border: #fecaca;
    --info: #0c4a6e;
    --info-soft: #f0f9ff;
    --info-border: #bae6fd;
    --success: #166534;
    --success-soft: #f0fdf4;
    --success-border: #bbf7d0;
    --warning: #92400e;
    --warning-soft: #fffbeb;
    --warning-border: #fde68a;
    --chart-ok: #18181b;
    --chart-error: #b91c1c;
    --chart-aborted: #a1a1aa;
    --chart-running: #71717a;
    --chart-track: #f4f4f5;
    --radius: 0.5rem;
    --radius-sm: 0.375rem;
    --radius-xs: 0.25rem;
    --shadow-xs: 0 1px 2px rgba(0, 0, 0, 0.04);
    --shadow-sm: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.04);
    --sidebar-width: 220px;
  }

  *,
  *::before,
  *::after {
    box-sizing: border-box;
  }

  html,
  body {
    height: 100%;
  }

  body {
    margin: 0;
    color: var(--foreground);
    background: var(--subtle);
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont,
      "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
    font-size: 14px;
    line-height: 1.5;
    -webkit-font-smoothing: antialiased;
    text-rendering: optimizeLegibility;
  }

  a {
    color: inherit;
    text-decoration: none;
  }

  a:hover {
    color: var(--foreground);
  }

  h1,
  h2,
  h3,
  h4,
  p {
    margin: 0;
  }

  h1 {
    font-size: 1.5rem;
    font-weight: 600;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  h2 {
    font-size: 1rem;
    font-weight: 600;
    letter-spacing: -0.005em;
  }

  h3 {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--muted-foreground);
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  code,
  kbd,
  samp,
  pre {
    font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
    font-size: 0.85em;
  }

  pre {
    margin: 0;
    padding: 0.85rem;
    background: var(--muted);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow-x: auto;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .muted {
    color: var(--muted-foreground);
  }

  .stack {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .row {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .row-between {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    align-items: center;
    justify-content: space-between;
  }

  .grid {
    display: grid;
    gap: 1rem;
  }

  .grid-2 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .grid-3 {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .grid-4 {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }

  @media (max-width: 1024px) {
    .grid-4 {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }

  @media (max-width: 760px) {
    .grid-2,
    .grid-3,
    .grid-4 {
      grid-template-columns: 1fr;
    }
  }

  /* Buttons */
  .btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    height: 2.25rem;
    padding: 0 0.85rem;
    font: inherit;
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--foreground);
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    cursor: pointer;
    transition: background-color 120ms ease, color 120ms ease,
      border-color 120ms ease, opacity 120ms ease;
  }

  .btn:hover {
    background: var(--accent);
  }

  .btn:focus-visible {
    outline: none;
    box-shadow: 0 0 0 3px rgba(9, 9, 11, 0.15);
  }

  .btn[disabled],
  .btn[aria-disabled='true'] {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn-primary {
    color: var(--primary-foreground);
    background: var(--primary);
    border-color: var(--primary);
  }

  .btn-primary:hover {
    background: var(--primary-hover);
    border-color: var(--primary-hover);
  }

  .btn-ghost {
    background: transparent;
    border-color: transparent;
    color: var(--muted-foreground);
  }

  .btn-ghost:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .btn-destructive {
    color: var(--destructive);
    background: var(--background);
    border-color: var(--destructive-border);
  }

  .btn-destructive:hover {
    background: var(--destructive-soft);
  }

  .btn-sm {
    height: 1.85rem;
    padding: 0 0.65rem;
    font-size: 0.78rem;
  }

  .btn-xs {
    height: 1.5rem;
    padding: 0 0.45rem;
    font-size: 0.72rem;
    border-radius: var(--radius-xs);
  }

  .btn-full {
    width: 100%;
  }

  .btn-group {
    display: inline-flex;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--background);
    overflow: hidden;
  }

  .btn-group .btn {
    border: 0;
    border-right: 1px solid var(--border);
    border-radius: 0;
    background: transparent;
  }

  .btn-group .btn:last-child {
    border-right: 0;
  }

  .btn-group .btn.is-active {
    background: var(--foreground);
    color: var(--primary-foreground);
  }

  /* Inputs */
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .field label,
  label.label {
    font-size: 0.8rem;
    font-weight: 500;
  }

  input,
  select,
  textarea {
    width: 100%;
    height: 2.25rem;
    padding: 0 0.7rem;
    color: var(--foreground);
    background: var(--background);
    border: 1px solid var(--input);
    border-radius: var(--radius-sm);
    font: inherit;
    font-size: 0.85rem;
    transition: border-color 120ms ease, box-shadow 120ms ease;
  }

  select {
    appearance: none;
    background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'%3E%3C/polyline%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 0.7rem center;
    padding-right: 2rem;
  }

  textarea {
    height: auto;
    padding: 0.6rem 0.7rem;
  }

  input::placeholder,
  textarea::placeholder {
    color: var(--muted-foreground);
  }

  input:focus-visible,
  select:focus-visible,
  textarea:focus-visible {
    outline: none;
    border-color: var(--ring);
    box-shadow: 0 0 0 3px rgba(9, 9, 11, 0.12);
  }

  /* Cards */
  .card {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-xs);
  }

  .card-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 1rem 1.1rem 0.5rem;
  }

  .card-head h2,
  .card-head h3 {
    margin: 0;
  }

  .card-body {
    padding: 0.75rem 1.1rem 1.1rem;
  }

  .card-body.tight {
    padding: 0.5rem 1.1rem 0.85rem;
  }

  .card-body.flush {
    padding: 0;
  }

  .card .card-foot {
    padding: 0.75rem 1.1rem;
    border-top: 1px solid var(--border);
    color: var(--muted-foreground);
    font-size: 0.8rem;
  }

  /* Stats */
  .stat {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    padding: 1rem 1.1rem;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-xs);
    overflow: hidden;
    min-width: 0;
  }

  .stat-label {
    color: var(--muted-foreground);
    font-size: 0.78rem;
    font-weight: 500;
    text-transform: uppercase;
    letter-spacing: 0.06em;
  }

  .stat-value {
    font-size: 1.6rem;
    font-weight: 600;
    letter-spacing: -0.02em;
  }

  .stat-delta {
    font-size: 0.78rem;
    color: var(--muted-foreground);
  }

  .stat-delta.up {
    color: var(--success);
  }

  .stat-delta.down {
    color: var(--destructive);
  }

  .stat-spark {
    margin-top: 0.25rem;
    width: 100%;
    height: 2rem;
    overflow: hidden;
    color: var(--muted-foreground);
  }

  .stat-spark svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  /* Tables */
  .table-wrap {
    overflow-x: auto;
  }

  table.data {
    width: 100%;
    border-collapse: separate;
    border-spacing: 0;
    font-size: 0.85rem;
  }

  table.data th,
  table.data td {
    padding: 0.7rem 1.1rem;
    text-align: left;
    border-bottom: 1px solid var(--border);
    vertical-align: middle;
  }

  table.data th {
    background: var(--subtle);
    font-weight: 500;
    color: var(--muted-foreground);
    text-transform: uppercase;
    font-size: 0.72rem;
    letter-spacing: 0.08em;
  }

  table.data tbody tr:last-child td {
    border-bottom: 0;
  }

  table.data tbody tr:hover td {
    background: var(--subtle);
  }

  table.data tr.clickable {
    cursor: pointer;
  }

  table.data td.numeric,
  table.data th.numeric {
    text-align: right;
    font-variant-numeric: tabular-nums;
  }

  table.data td code {
    color: var(--foreground);
  }

  /* Pills */
  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.1rem 0.5rem;
    border-radius: 999px;
    border: 1px solid var(--border);
    background: var(--background);
    font-size: 0.75rem;
    font-weight: 500;
    line-height: 1.5;
    color: var(--foreground);
  }

  .pill.soft {
    border-color: transparent;
    background: var(--muted);
    color: var(--foreground);
  }

  .pill-ok {
    color: var(--success);
    background: var(--success-soft);
    border-color: var(--success-border);
  }

  .pill-error {
    color: var(--destructive);
    background: var(--destructive-soft);
    border-color: var(--destructive-border);
  }

  .pill-aborted,
  .pill-disabled {
    color: var(--muted-foreground);
    background: var(--muted);
    border-color: var(--border);
  }

  .pill-running,
  .pill-info {
    color: var(--info);
    background: var(--info-soft);
    border-color: var(--info-border);
  }

  .pill-warning {
    color: var(--warning);
    background: var(--warning-soft);
    border-color: var(--warning-border);
  }

  .dot {
    display: inline-block;
    width: 6px;
    height: 6px;
    border-radius: 999px;
    background: currentColor;
  }

  /* Alerts */
  .alert {
    padding: 0.7rem 0.85rem;
    border-radius: var(--radius-sm);
    border: 1px solid transparent;
    font-size: 0.85rem;
  }

  .alert-error {
    color: var(--destructive);
    background: var(--destructive-soft);
    border-color: var(--destructive-border);
  }

  .alert-info {
    color: var(--info);
    background: var(--info-soft);
    border-color: var(--info-border);
  }

  .alert-success {
    color: var(--success);
    background: var(--success-soft);
    border-color: var(--success-border);
  }

  .alert-warning {
    color: var(--warning);
    background: var(--warning-soft);
    border-color: var(--warning-border);
  }

  .empty {
    color: var(--muted-foreground);
    padding: 1.25rem 1.1rem;
    font-size: 0.85rem;
    text-align: center;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
  }

  /* Auth */
  .auth {
    display: flex;
    align-items: center;
    justify-content: center;
    min-height: 100vh;
    padding: 2rem 1rem;
    background: var(--subtle);
  }

  .auth-card {
    width: 100%;
    max-width: 384px;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
    padding: 1.75rem;
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: var(--shadow-sm);
  }

  .auth-header {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
  }

  .auth-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2.25rem;
    height: 2.25rem;
    margin-bottom: 0.4rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--muted);
  }

  .auth-foot {
    margin-top: 0.25rem;
    text-align: center;
    font-size: 0.75rem;
    letter-spacing: 0.02em;
  }

  /* Shell */
  .app {
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    min-height: 100vh;
  }

  .sidebar {
    position: sticky;
    top: 0;
    align-self: start;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    height: 100vh;
    padding: 1.25rem 0.85rem;
    background: var(--background);
    border-right: 1px solid var(--border);
  }

  .sidebar-inner {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }

  .brand {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.2rem 0.35rem;
    font-weight: 600;
    letter-spacing: -0.01em;
  }

  .brand-mark {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 1.75rem;
    height: 1.75rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--muted);
  }

  .brand-text {
    font-size: 0.92rem;
  }

  .nav {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
  }

  .nav-item {
    display: flex;
    align-items: center;
    height: 2.1rem;
    padding: 0 0.6rem;
    font-size: 0.85rem;
    color: var(--muted-foreground);
    border-radius: var(--radius-sm);
    transition: background-color 120ms ease, color 120ms ease;
  }

  .nav-item:hover {
    background: var(--accent);
    color: var(--foreground);
  }

  .nav-item.is-active {
    background: var(--muted);
    color: var(--foreground);
    font-weight: 500;
  }

  .sidebar-foot {
    margin-top: 1rem;
  }

  .content {
    padding: 1.75rem 2rem;
    min-width: 0;
  }

  .page-head {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 1rem;
    margin-bottom: 1.5rem;
  }

  .page-head-main {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
  }

  .page-head-tools {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
  }

  .page-body {
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  /* Charts */
  .chart {
    width: 100%;
    height: 220px;
    overflow: hidden;
  }

  .chart svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: hidden;
  }

  .chart-legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.85rem;
    font-size: 0.78rem;
    color: var(--muted-foreground);
    margin-top: 0.6rem;
  }

  .chart-legend-item {
    display: inline-flex;
    align-items: center;
    gap: 0.35rem;
  }

  .chart-swatch {
    display: inline-block;
    width: 10px;
    height: 10px;
    border-radius: 2px;
  }

  details.json {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
  }

  details.json summary {
    padding: 0.6rem 0.85rem;
    cursor: pointer;
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--muted-foreground);
  }

  details.json[open] summary {
    border-bottom: 1px solid var(--border);
    color: var(--foreground);
  }

  details.json pre {
    border: 0;
    border-radius: 0 0 var(--radius-sm) var(--radius-sm);
    background: var(--background);
  }

  .payload-stack {
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
  }

  details.payload-panel {
    background: var(--background);
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    overflow: hidden;
  }

  details.payload-panel > summary {
    padding: 0.65rem 0.85rem;
    cursor: pointer;
    font-size: 0.82rem;
    font-weight: 600;
    color: var(--muted-foreground);
  }

  details.payload-panel[open] > summary {
    color: var(--foreground);
    border-bottom: 1px solid var(--border);
  }

  .payload-panel-body {
    padding: 0.8rem 0.85rem;
  }

  .payload-panel-body details.json {
    border-color: var(--border);
  }

  .payload-panel-body details.json pre {
    max-height: 24rem;
  }

  .markdown-view {
    background: var(--subtle);
    border-color: var(--border);
    line-height: 1.6;
  }

  .kv {
    display: grid;
    grid-template-columns: minmax(140px, 200px) minmax(0, 1fr);
    gap: 0.4rem 1rem;
    font-size: 0.85rem;
  }

  .kv dt {
    color: var(--muted-foreground);
  }

  .kv dd {
    margin: 0;
    color: var(--foreground);
    word-break: break-word;
  }

  .event-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .event {
    display: grid;
    grid-template-columns: 7.5rem 6.5rem minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.55rem 0.85rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-sm);
    background: var(--background);
    align-items: center;
    font-size: 0.82rem;
  }

  .event code {
    color: var(--foreground);
  }

  .event-time {
    color: var(--muted-foreground);
    font-variant-numeric: tabular-nums;
  }

  .event-body {
    color: var(--muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
  }

  .form .row {
    gap: 0.5rem;
  }

  @media (max-width: 820px) {
    .app {
      grid-template-columns: 1fr;
    }

    .sidebar {
      position: static;
      height: auto;
      flex-direction: row;
      justify-content: space-between;
      align-items: center;
      padding: 0.85rem 1rem;
    }

    .sidebar-inner {
      flex-direction: row;
      gap: 1rem;
      align-items: center;
    }

    .nav {
      flex-direction: row;
    }

    .sidebar-foot {
      margin: 0;
    }

    .content {
      padding: 1.25rem 1rem;
    }
  }
`;
