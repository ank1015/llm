import { isGatewayImageApi, SupportedGatewayApis } from '../../../vault/provider-key-vault.js';
import { renderAlert, renderCard, renderPill, renderTable } from '../components.js';
import { escapeHtml, formatDate, formatRelative } from '../format.js';
import { renderShell } from '../layout.js';

import type { GatewayEnv } from '../../../context.js';
import type { GatewayApi } from '../../../vault/provider-key-vault.js';
import type { Context } from 'hono';

type DashboardMessage = { kind: 'error' | 'info' | 'success'; text: string };

interface ProviderRow {
  api: GatewayApi;
  configured: boolean;
  supportsImage: boolean;
  updatedAt: number | null;
}

export function renderProvidersPage(c: Context<GatewayEnv>, message?: DashboardMessage): string {
  const services = c.get('services');
  const stored = new Map<string, number>();
  for (const record of services.db.listProviderKeys()) {
    stored.set(record.api, record.updatedAt);
  }
  const configuredSet = new Set(services.vault.listConfiguredApis());

  const rows: ProviderRow[] = SupportedGatewayApis.map((api) => ({
    api,
    configured: configuredSet.has(api),
    supportsImage: isGatewayImageApi(api),
    updatedAt: stored.get(api) ?? null,
  }));

  const table = renderTable<ProviderRow>({
    empty: 'No providers supported.',
    rows,
    columns: [
      {
        head: 'Provider',
        render: (row) =>
          `<span style="display:inline-flex;align-items:center;gap:0.4rem;"><strong>${escapeHtml(row.api)}</strong>${row.supportsImage ? `<span class="pill soft">images</span>` : ''}</span>`,
      },
      {
        head: 'Status',
        render: (row) =>
          row.configured ? renderPill('configured', 'ok') : renderPill('missing', 'disabled'),
      },
      {
        head: 'Key updated',
        render: (row) =>
          row.updatedAt
            ? `<span class="muted" title="${escapeHtml(formatDate(row.updatedAt))}">${escapeHtml(formatRelative(row.updatedAt))}</span>`
            : '<span class="muted">—</span>',
      },
      {
        head: 'Set / rotate',
        render: (row) => renderProviderForm(row.api, row.configured),
      },
    ],
  });

  const body = `
    ${message ? renderAlert(message.kind, message.text) : ''}
    ${renderCard({
      title: 'Provider keys',
      subtitle:
        'Keys are encrypted at rest with GATEWAY_ENCRYPTION_KEY and never rendered back to the browser.',
      padded: false,
      body: table,
    })}
  `;

  return renderShell({
    active: 'providers',
    title: 'Providers',
    description: 'Server-side API keys for supported upstream providers.',
    body,
  });
}

function renderProviderForm(api: GatewayApi, configured: boolean): string {
  if (api === 'azure-openai') {
    return `
    <form method="post" action="/admin/dashboard/providers" class="row" style="gap: 0.4rem; flex-wrap: wrap; justify-content: flex-end;">
      <input type="hidden" name="api" value="${escapeHtml(api)}" />
      <input name="apiKey" type="password" placeholder="${configured ? 'Rotate key…' : 'Paste API key'}" autocomplete="off" required style="width: 180px;" />
      <input name="azureDeploymentUrl" type="url" placeholder="https://resource.../openai/responses?api-version=..." autocomplete="off" required style="width: 360px;" />
      <input name="azureDeploymentName" type="text" placeholder="Deployment name (optional)" autocomplete="off" style="width: 190px;" />
      <button class="btn btn-sm${configured ? '' : ' btn-primary'}" type="submit">${configured ? 'Rotate' : 'Store'}</button>
    </form>
  `;
  }

  return `
    <form method="post" action="/admin/dashboard/providers" class="row" style="gap: 0.4rem; flex-wrap: nowrap; justify-content: flex-end;">
      <input type="hidden" name="api" value="${escapeHtml(api)}" />
      <input name="apiKey" type="password" placeholder="${configured ? 'Rotate key…' : 'Paste API key'}" autocomplete="off" required style="width: 220px;" />
      <button class="btn btn-sm${configured ? '' : ' btn-primary'}" type="submit">${configured ? 'Rotate' : 'Store'}</button>
    </form>
  `;
}
