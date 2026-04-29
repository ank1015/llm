/* global document, window */

const runtime = document.querySelector('#runtime');
const themeToggle = document.querySelector('#theme-toggle');
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

applyTheme(getStoredTheme());
renderThemeToggle();
themeToggle?.addEventListener('click', toggleTheme);

void setRuntimeText();
