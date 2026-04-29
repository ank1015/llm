/* global document, window */

const runtime = document.querySelector('#runtime');
const loginButton = document.querySelector('#login-button');
const loginForm = document.querySelector('#login-form');
const loginScreen = document.querySelector('#login-screen');
const loginStatus = document.querySelector('#login-status');
const nextScreen = document.querySelector('#next-screen');
const passwordInput = document.querySelector('#password');
const setupChecksElement = document.querySelector('#setup-checks');
const setupStatus = document.querySelector('#setup-status');
const signOutButton = document.querySelector('#sign-out');
const themeToggle = document.querySelector('#theme-toggle');
const usernameInput = document.querySelector('#username');
const themeStorageKey = 'theme';

const getStoredTheme = () => {
  const storedTheme = window.localStorage.getItem(themeStorageKey);

  if (storedTheme === 'light' || storedTheme === 'dark') {
    return storedTheme;
  }

  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
};

const applyTheme = (theme) => {
  document.documentElement.classList.toggle('dark', theme === 'dark');
  document.documentElement.style.colorScheme = theme;
  window.localStorage.setItem(themeStorageKey, theme);
};

const createIcon = (icon, size) => {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('fill', 'none');
  svg.setAttribute('aria-hidden', 'true');

  for (const [tagName, attributes] of icon) {
    const child = document.createElementNS('http://www.w3.org/2000/svg', tagName);

    for (const [name, value] of Object.entries(attributes)) {
      if (name !== 'key') {
        child.setAttribute(name, String(value));
      }
    }

    svg.append(child);
  }

  return svg;
};

const renderThemeToggle = () => {
  if (!themeToggle || !window.desktopThemeIcons) {
    return;
  }

  const theme = getStoredTheme();
  const nextTheme = theme === 'light' ? 'dark' : 'light';
  const icon = theme === 'light' ? window.desktopThemeIcons.dark : window.desktopThemeIcons.light;
  const iconSize = theme === 'dark' ? 20 : 18;

  themeToggle.replaceChildren(createIcon(icon, iconSize));
  themeToggle.setAttribute('aria-label', `Switch to ${nextTheme} theme`);
};

const toggleTheme = () => {
  const nextTheme = getStoredTheme() === 'light' ? 'dark' : 'light';

  applyTheme(nextTheme);
  renderThemeToggle();
};

const setRuntimeText = async () => {
  if (!runtime || !window.desktopApp) {
    return;
  }

  const info = await window.desktopApp.getRuntimeInfo();
  runtime.textContent = `Server ${info.server.status}`;
};

const showLogin = () => {
  if (loginScreen && nextScreen && signOutButton) {
    loginScreen.hidden = false;
    nextScreen.hidden = true;
    signOutButton.hidden = true;
  }
};

const showNext = () => {
  if (loginScreen && nextScreen && signOutButton) {
    loginScreen.hidden = true;
    nextScreen.hidden = false;
    signOutButton.hidden = false;
    void runSetupChecks();
  }
};

const setLoginStatus = (message, tone) => {
  if (!loginStatus) {
    return;
  }

  loginStatus.textContent = message;
  loginStatus.dataset.tone = tone;
};

const setLoginPending = (pending) => {
  if (loginButton && usernameInput && passwordInput) {
    loginButton.disabled = pending;
    usernameInput.disabled = pending;
    passwordInput.disabled = pending;
  }
};

const initializeGatewaySession = async () => {
  if (!window.desktopApp) {
    showLogin();
    setLoginStatus('Desktop bridge is not available.', 'error');
    return;
  }

  const session = await window.desktopApp.getGatewaySession();

  if (session.authenticated) {
    showNext();
    return;
  }

  showLogin();
};

const submitLogin = async (event) => {
  event.preventDefault();

  if (!window.desktopApp || !usernameInput || !passwordInput) {
    return;
  }

  setLoginPending(true);
  setLoginStatus('Signing in...', 'muted');

  const result = await window.desktopApp.loginGateway({
    username: usernameInput.value,
    password: passwordInput.value,
  });

  setLoginPending(false);

  if (result.ok) {
    passwordInput.value = '';
    setLoginStatus('', 'muted');
    showNext();
    return;
  }

  setLoginStatus(result.message, 'error');
  showLogin();
};

const signOut = async () => {
  if (!window.desktopApp) {
    return;
  }

  await window.desktopApp.signOutGateway();
  showLogin();
  setLoginStatus('', 'muted');
};

const renderSetupChecks = (checks) => {
  if (!setupChecksElement) {
    return;
  }

  setupChecksElement.replaceChildren(
    ...checks.map((check) => {
      const row = document.createElement('article');
      row.className = check.installed ? 'setupCheck ready' : 'setupCheck missing';

      const copy = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = check.label;

      const details = document.createElement('p');
      details.textContent = check.installed
        ? [
            `${check.command} detected${check.version ? `: ${check.version}` : ''}`,
            check.executablePath ? check.executablePath : '',
          ]
            .filter(Boolean)
            .join(' | ')
        : `${check.command} missing`;

      const badge = document.createElement('span');
      badge.className = 'setupBadge';
      badge.textContent = check.installed ? 'Ready' : 'Missing';

      copy.append(title, details);
      row.append(copy, badge);

      return row;
    })
  );
};

const runSetupChecks = async () => {
  if (!setupStatus || !setupChecksElement || !window.desktopApp) {
    return;
  }

  setupStatus.textContent = 'Checking';
  setupStatus.dataset.tone = 'muted';
  setupChecksElement.replaceChildren();

  try {
    const checks = await window.desktopApp.checkSetupRequirements();
    const missing = checks.filter((check) => !check.installed);

    renderSetupChecks(checks);
    setupStatus.textContent =
      missing.length === 0
        ? 'All ready'
        : `Missing ${missing.map((check) => check.label).join(', ')}`;
    setupStatus.dataset.tone = missing.length === 0 ? 'success' : 'warning';
  } catch {
    setupStatus.textContent = 'Unable to check';
    setupStatus.dataset.tone = 'error';
  }
};

applyTheme(getStoredTheme());
renderThemeToggle();
void initializeGatewaySession();
loginForm?.addEventListener('submit', submitLogin);
signOutButton?.addEventListener('click', signOut);
themeToggle?.addEventListener('click', toggleTheme);

void setRuntimeText();
