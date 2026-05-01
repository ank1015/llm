/* global document, window */

const statusElement = document.querySelector('#startup-status');

const setStartupError = (message) => {
  if (!statusElement) {
    return;
  }

  statusElement.textContent = message;
  statusElement.dataset.tone = 'error';
};

window.desktopApp?.onStartupError?.(setStartupError);
