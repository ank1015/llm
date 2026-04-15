/* global document, window */

const requirements = document.querySelector('#requirements');
const refreshButton = document.querySelector('#refresh');
const launchButton = document.querySelector('#launch');
const statusElement = document.querySelector('#status');

const setStatus = (message, tone = 'neutral') => {
  statusElement.textContent = message;
  statusElement.dataset.tone = tone;
};

const renderChecks = (checks) => {
  requirements.replaceChildren(
    ...checks.map((check) => {
      const row = document.createElement('article');
      row.className = 'requirement';

      const copy = document.createElement('div');
      const title = document.createElement('h3');
      title.textContent = check.label;

      const details = document.createElement('p');
      details.textContent = check.installed
        ? `${check.command} detected${check.version ? `: ${check.version}` : ''}`
        : `${check.command} was not found on PATH`;

      copy.append(title, details);

      const action = document.createElement('a');
      action.href = check.installUrl;
      action.target = '_blank';
      action.rel = 'noreferrer';
      action.className = check.installed ? 'badge ready' : 'badge missing';
      action.textContent = check.installed ? 'Ready' : 'Install';

      row.append(copy, action);

      return row;
    })
  );
};

const refreshChecks = async () => {
  refreshButton.disabled = true;
  launchButton.disabled = true;
  setStatus('Checking local requirements...');

  try {
    const checks = await window.setupApp.checkDependencies();
    renderChecks(checks);

    const missing = checks.filter((check) => !check.installed);
    launchButton.disabled = missing.length > 0;

    setStatus(
      missing.length === 0
        ? 'All requirements are ready.'
        : `Install ${missing.map((check) => check.label).join(', ')} to continue.`,
      missing.length === 0 ? 'success' : 'warning'
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to check requirements.';
    setStatus(message, 'error');
  } finally {
    refreshButton.disabled = false;
  }
};

const launchMainApp = async () => {
  launchButton.disabled = true;
  setStatus('Launching main app...');

  try {
    const result = await window.setupApp.launchMainApp();
    setStatus(result.message, result.ok ? 'success' : 'error');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to launch main app.';
    setStatus(message, 'error');
  } finally {
    launchButton.disabled = false;
  }
};

refreshButton.addEventListener('click', () => {
  void refreshChecks();
});

launchButton.addEventListener('click', () => {
  void launchMainApp();
});

void refreshChecks();
