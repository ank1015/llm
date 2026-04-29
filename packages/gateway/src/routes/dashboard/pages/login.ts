import { renderAlert } from '../components.js';
import { renderMinimalPage } from '../layout.js';

export function renderLoginPage(missingConfig: boolean, error?: string): string {
  const message = missingConfig
    ? 'Set GATEWAY_ADMIN_USERNAME and GATEWAY_ADMIN_PASSWORD to enable browser login.'
    : error;

  return renderMinimalPage({
    body: `
      <main class="auth">
        <div class="auth-card">
          <header class="auth-header">
            <div class="auth-mark" aria-hidden="true">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M4 12h10"/><path d="M4 17h16"/></svg>
            </div>
            <h1>Sign in</h1>
            <p class="muted">Enter your credentials to access the gateway admin.</p>
          </header>
          ${message ? renderAlert(missingConfig ? 'info' : 'error', message) : ''}
          <form method="post" action="/admin/login" class="form" novalidate>
            <div class="field">
              <label for="username">Username</label>
              <input id="username" name="username" autocomplete="username" spellcheck="false" autocapitalize="none" required />
            </div>
            <div class="field">
              <label for="password">Password</label>
              <input id="password" name="password" type="password" autocomplete="current-password" required />
            </div>
            <button class="btn btn-primary btn-full" type="submit">Continue</button>
          </form>
          <p class="auth-foot muted">LLM Gateway · admin console</p>
        </div>
      </main>
    `,
    title: 'Sign in · LLM Gateway',
  });
}
