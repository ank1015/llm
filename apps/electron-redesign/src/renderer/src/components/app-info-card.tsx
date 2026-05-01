import { useEffect, useState } from 'react';

import { desktopApi } from '../lib/desktop-bridge';

import type { AppInfo } from '@shared/ipc-contract';

export const AppInfoCard = (): React.ReactElement => {
  const [info, setInfo] = useState<AppInfo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    desktopApi()
      .getAppInfo()
      .then((value) => {
        if (!cancelled) {
          setInfo(value);
        }
      })
      .catch((reason: unknown) => {
        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : 'Failed to load app info.');
        }
      });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section className="card" aria-labelledby="app-info-title">
      <h2 id="app-info-title">Runtime</h2>
      {error !== null && <p role="alert">{error}</p>}
      {info === null && error === null && <p>Loading…</p>}
      {info !== null && (
        <dl className="kv">
          <dt>App</dt>
          <dd>v{info.appVersion}</dd>
          <dt>Electron</dt>
          <dd>{info.electronVersion}</dd>
          <dt>Chrome</dt>
          <dd>{info.chromeVersion}</dd>
          <dt>Node</dt>
          <dd>{info.nodeVersion}</dd>
          <dt>Platform</dt>
          <dd>{info.platform}</dd>
        </dl>
      )}
    </section>
  );
};
