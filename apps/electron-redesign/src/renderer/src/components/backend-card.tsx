import { useCallback, useEffect, useState } from 'react';

import { fetchHealth, sendEcho } from '../lib/api-client';
import { desktopApi } from '../lib/desktop-bridge';

import type { EchoResponse, HealthResponse } from '@shared/api-contract';
import type { BackendInfo } from '@shared/ipc-contract';

export const BackendCard = (): React.ReactElement => {
  const [backend, setBackend] = useState<BackendInfo | null>(null);
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [echo, setEcho] = useState<EchoResponse | null>(null);
  const [message, setMessage] = useState('Hello from the renderer!');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (): Promise<void> => {
    setError(null);
    setBusy(true);

    try {
      const status = await desktopApi().getBackendStatus();
      setBackend(status);

      if (status.status === 'running' && status.url !== null) {
        setHealth(await fetchHealth());
      }
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Failed to refresh backend.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const onEcho = useCallback(async (): Promise<void> => {
    setError(null);
    setBusy(true);

    try {
      setEcho(await sendEcho(message));
    } catch (reason: unknown) {
      setError(reason instanceof Error ? reason.message : 'Echo request failed.');
    } finally {
      setBusy(false);
    }
  }, [message]);

  const tone: 'success' | 'error' | 'neutral' =
    backend?.status === 'running' ? 'success' : backend?.status === 'error' ? 'error' : 'neutral';

  return (
    <section className="card" aria-labelledby="backend-title">
      <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h2 id="backend-title">Embedded backend</h2>
        <span className="status-pill" data-tone={tone}>
          {backend?.status ?? 'unknown'}
        </span>
      </header>

      <dl className="kv">
        <dt>URL</dt>
        <dd>
          {backend?.url === null || backend?.url === undefined ? '—' : <code>{backend.url}</code>}
        </dd>
        <dt>Port</dt>
        <dd>{backend?.port ?? '—'}</dd>
        <dt>Uptime</dt>
        <dd>{health === null ? '—' : `${String(health.uptimeSeconds)}s`}</dd>
      </dl>

      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
        <input
          aria-label="Echo message"
          value={message}
          onChange={(event) => {
            setMessage(event.target.value);
          }}
          style={{
            flex: 1,
            padding: '0.5rem 0.75rem',
            borderRadius: 'var(--radius)',
            border: '1px solid var(--border)',
            background: 'var(--surface-2)',
            color: 'var(--text)',
          }}
        />
        <button type="button" disabled={busy} onClick={() => void onEcho()}>
          Send
        </button>
        <button type="button" disabled={busy} onClick={() => void refresh()}>
          Refresh
        </button>
      </div>

      {echo !== null && (
        <p>
          Backend received <code>{echo.received}</code> at{' '}
          <code>{new Date(echo.receivedAt).toLocaleTimeString()}</code>
        </p>
      )}
      {error !== null && (
        <p role="alert" style={{ color: 'var(--error)' }}>
          {error}
        </p>
      )}
    </section>
  );
};
