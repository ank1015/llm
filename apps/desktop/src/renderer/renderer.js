/* global document, window */

const runtime = document.querySelector('#runtime');

const setRuntimeText = async () => {
  if (!runtime || !window.desktopApp) {
    return;
  }

  const info = await window.desktopApp.getRuntimeInfo();
  runtime.textContent = `Server ${info.server.status}`;
};

void setRuntimeText();
