interface ObserveScriptOptions {
  maxInteractive: number;
  maxTextBlocks: number;
}

export function buildObserveScript(options: ObserveScriptOptions): string {
  const serializedOptions = JSON.stringify(options);

  return `
(() => {
  const options = ${serializedOptions};

  const normalizeText = (value, maxLength = 220) => {
    if (typeof value !== 'string') return '';
    const compact = value.replace(/\\s+/g, ' ').trim();
    if (!compact) return '';
    if (compact.length <= maxLength) return compact;
    return compact.slice(0, Math.max(1, maxLength - 1)) + '...';
  };

  const toInt = (value) => {
    if (typeof value !== 'number' || Number.isNaN(value)) return 0;
    return Math.round(value);
  };

  const cssEscape = (value) => {
    if (window.CSS && typeof window.CSS.escape === 'function') {
      return window.CSS.escape(value);
    }
    return String(value).replace(/[^a-zA-Z0-9_-]/g, '\\\\$&');
  };

  const buildCssPath = (element) => {
    if (!(element instanceof Element)) return '';
    const parts = [];
    let current = element;
    let depth = 0;

    while (current && current.nodeType === 1 && depth < 6) {
      let selector = current.tagName.toLowerCase();
      if (current.id) {
        selector += '#' + cssEscape(current.id);
        parts.unshift(selector);
        break;
      }

      const parent = current.parentElement;
      if (parent) {
        const siblings = Array.from(parent.children).filter(
          (node) => node.tagName === current.tagName
        );
        if (siblings.length > 1) {
          selector += ':nth-of-type(' + (siblings.indexOf(current) + 1) + ')';
        }
      }

      parts.unshift(selector);
      current = parent;
      depth += 1;
    }

    return parts.join(' > ');
  };

  const getRectInfo = (element) => {
    const rect = element.getBoundingClientRect();
    return {
      x: toInt(rect.left),
      y: toInt(rect.top),
      width: toInt(rect.width),
      height: toInt(rect.height),
      bottom: rect.bottom,
      right: rect.right,
      top: rect.top,
      left: rect.left,
    };
  };

  const getVisibility = (element) => {
    const rect = getRectInfo(element);
    const style = window.getComputedStyle(element);
    const hidden =
      element.hidden ||
      element.getAttribute('aria-hidden') === 'true' ||
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      Number.parseFloat(style.opacity || '1') === 0 ||
      rect.width <= 0 ||
      rect.height <= 0;

    const viewportWidth = window.innerWidth || document.documentElement.clientWidth || 0;
    const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    const offscreen =
      rect.bottom < 0 || rect.right < 0 || rect.top > viewportHeight || rect.left > viewportWidth;

    return { hidden, offscreen, rect };
  };

  const getElementText = (element, maxLength = 180) => {
    const rawText =
      typeof element.innerText === 'string' && element.innerText.trim()
        ? element.innerText
        : element.textContent || '';
    return normalizeText(rawText, maxLength);
  };

  const getByLabelledBy = (element) => {
    const labelledBy = normalizeText(element.getAttribute('aria-labelledby') || '', 300);
    if (!labelledBy) return '';

    const parts = labelledBy
      .split(/\\s+/)
      .map((id) => document.getElementById(id))
      .filter(Boolean)
      .map((node) => getElementText(node, 100))
      .filter(Boolean);

    return normalizeText(parts.join(' '), 160);
  };

  const getLabelText = (element) => {
    const labels = [];

    if (element.id) {
      const forLabel = document.querySelector('label[for="' + cssEscape(element.id) + '"]');
      if (forLabel) labels.push(getElementText(forLabel, 100));
    }

    if (element.labels && element.labels.length) {
      for (const label of element.labels) labels.push(getElementText(label, 100));
    }

    if (typeof element.closest === 'function') {
      const parentLabel = element.closest('label');
      if (parentLabel) labels.push(getElementText(parentLabel, 100));
    }

    return labels.find(Boolean) || '';
  };

  const getName = (element) => {
    const ariaLabel = normalizeText(element.getAttribute('aria-label') || '', 160);
    if (ariaLabel) return ariaLabel;

    const labelledBy = getByLabelledBy(element);
    if (labelledBy) return labelledBy;

    const labelText = getLabelText(element);
    if (labelText) return labelText;

    const placeholder = normalizeText(element.getAttribute('placeholder') || '', 140);
    if (placeholder) return placeholder;

    const title = normalizeText(element.getAttribute('title') || '', 140);
    if (title) return title;

    const alt = normalizeText(element.getAttribute('alt') || '', 140);
    if (alt) return alt;

    if (typeof element.value === 'string' && element.value && element.type !== 'password') {
      return normalizeText(element.value, 140);
    }

    return getElementText(element, 180);
  };

  const getRole = (element) => normalizeText(element.getAttribute('role') || '', 60);

  const getCategory = (element) => {
    const tag = element.tagName.toLowerCase();
    const role = getRole(element);
    const type = normalizeText(element.getAttribute('type') || '', 40).toLowerCase();

    if (
      tag === 'button' ||
      role === 'button' ||
      (tag === 'input' && ['button', 'submit', 'reset', 'image'].includes(type))
    ) {
      return 'button';
    }

    if ((tag === 'a' && element.getAttribute('href')) || role === 'link') {
      return 'link';
    }

    if (
      tag === 'input' ||
      tag === 'select' ||
      tag === 'textarea' ||
      element.isContentEditable
    ) {
      return 'input';
    }

    return 'interactive';
  };

  const getActions = (element, category) => {
    const actions = [];
    const addAction = (action) => {
      if (!actions.includes(action)) actions.push(action);
    };

    const tag = element.tagName.toLowerCase();
    const type = normalizeText(element.getAttribute('type') || '', 40).toLowerCase();

    if (category === 'button' || category === 'link') addAction('click');
    if (tag === 'select') addAction('select');
    if (tag === 'textarea' || element.isContentEditable) addAction('type');
    if (tag === 'input') {
      if (type === 'checkbox' || type === 'radio') addAction('toggle');
      else if (type === 'file') addAction('upload');
      else if (
        !['button', 'submit', 'reset', 'image', 'hidden'].includes(type) &&
        category === 'input'
      )
        addAction('type');
    }

    if (actions.length === 0 && category === 'interactive') addAction('click');
    return actions;
  };

  const getState = (element) => {
    const state = [];

    if (
      (typeof element.disabled === 'boolean' && element.disabled) ||
      element.getAttribute('aria-disabled') === 'true'
    ) {
      state.push('disabled');
    }
    if (typeof element.readOnly === 'boolean' && element.readOnly) state.push('readonly');
    if (typeof element.required === 'boolean' && element.required) state.push('required');
    if (typeof element.checked === 'boolean' && element.checked) state.push('checked');
    if (element.getAttribute('aria-expanded') === 'true') state.push('expanded');
    if (element.getAttribute('aria-pressed') === 'true') state.push('pressed');
    if (element.getAttribute('aria-current')) state.push('current');

    return state;
  };

  const getLocator = (element) => {
    const locator = {};
    const role = getRole(element);
    const id = normalizeText(element.getAttribute('id') || '', 120);
    const testId = normalizeText(
      element.getAttribute('data-testid') ||
        element.getAttribute('data-test-id') ||
        element.getAttribute('data-test') ||
        element.getAttribute('data-qa') ||
        '',
      120
    );
    const name = normalizeText(element.getAttribute('name') || '', 120);

    if (id) locator.id = id;
    if (testId) locator.testId = testId;
    if (name) locator.name = name;
    if (role) locator.role = role;

    const cssPath = buildCssPath(element);
    if (cssPath) locator.cssPath = cssPath;

    return locator;
  };

  const getSelectOptions = (element, maxOptions = 30) => {
    if (!(element instanceof HTMLSelectElement)) return [];

    const options = [];
    for (const option of Array.from(element.options).slice(0, maxOptions)) {
      const value = normalizeText(option.value || '', 140);
      const label = normalizeText(option.textContent || '', 140);
      if (!value && !label) continue;

      options.push({
        value,
        label,
        selected: Boolean(option.selected),
        disabled: Boolean(option.disabled),
      });
    }

    return options;
  };

  const groupSelector = [
    '[data-testid]',
    '[id]',
    'article',
    '[role="article"]',
    'li',
    '[role="listitem"]',
    'tr',
    'section',
    'form',
    'main',
  ].join(',');
  const groupIdByKey = new Map();
  let groupCounter = 1;

  const getGroupContainer = (element) => {
    if (!(element instanceof Element)) return null;
    return element.closest(groupSelector) || element.parentElement || document.body;
  };

  const getGroupKey = (element) => {
    const testId = normalizeText(element.getAttribute('data-testid') || '', 120);
    if (testId) return 'testid:' + testId;

    const id = normalizeText(element.id || '', 120);
    if (id) return 'id:' + id;

    const cssPath = normalizeText(buildCssPath(element), 240);
    if (cssPath) return 'css:' + cssPath;

    return 'tag:' + element.tagName.toLowerCase();
  };

  const getGroupId = (element) => {
    const container = getGroupContainer(element);
    if (!(container instanceof Element)) return 'G0';

    const key = getGroupKey(container);
    const existing = groupIdByKey.get(key);
    if (existing) return existing;

    const next = 'G' + groupCounter++;
    groupIdByKey.set(key, next);
    return next;
  };

  const sortByPosition = (a, b) => {
    if (a.bbox.y !== b.bbox.y) return a.bbox.y - b.bbox.y;
    if (a.bbox.x !== b.bbox.x) return a.bbox.x - b.bbox.x;
    const aLabel = typeof a.tag === 'string' ? a.tag : typeof a.kind === 'string' ? a.kind : '';
    const bLabel = typeof b.tag === 'string' ? b.tag : typeof b.kind === 'string' ? b.kind : '';
    return aLabel.localeCompare(bLabel);
  };

  const interactiveSelectors = [
    'a[href]',
    'button',
    'input',
    'select',
    'textarea',
    '[role="button"]',
    '[role="link"]',
    '[contenteditable="true"]',
    '[contenteditable=""]',
    '[tabindex]:not([tabindex="-1"])',
  ].join(',');

  const interactiveCandidates = Array.from(document.querySelectorAll(interactiveSelectors));
  const uniqueCandidates = Array.from(new Set(interactiveCandidates));

  let hiddenFilteredCount = 0;
  let offscreenFilteredCount = 0;
  const interactiveRows = [];

  for (const element of uniqueCandidates) {
    const visibility = getVisibility(element);
    if (visibility.hidden) {
      hiddenFilteredCount += 1;
      continue;
    }
    if (visibility.offscreen) {
      offscreenFilteredCount += 1;
      continue;
    }

    const category = getCategory(element);
    const actions = getActions(element, category);
    if (actions.length === 0) continue;

    const tag = element.tagName.toLowerCase();
    const role = getRole(element);
    const name = getName(element);
    const state = getState(element);
    const locator = getLocator(element);
    const bbox = {
      x: visibility.rect.x,
      y: visibility.rect.y,
      width: visibility.rect.width,
      height: visibility.rect.height,
    };

    const row = {
      category,
      tag,
      role,
      name,
      groupId: getGroupId(element),
      actions,
      state,
      locator,
      bbox,
    };

    if (tag === 'a') {
      const href = normalizeText(element.getAttribute('href') || '', 320);
      if (href) row.href = href;
    }
    if (tag === 'select') {
      const selectOptions = getSelectOptions(element);
      if (selectOptions.length > 0) row.selectOptions = selectOptions;
    }

    interactiveRows.push(row);
  }

  interactiveRows.sort(sortByPosition);
  const totalInteractiveCount = interactiveRows.length;
  const interactive = interactiveRows.slice(0, options.maxInteractive).map((row, index) => ({
    id: 'E' + (index + 1),
    ...row,
  }));

  const textSeen = new Set();
  const textBlocks = [];
  const addTextBlock = (kind, text, source, groupId, level) => {
    const normalized = normalizeText(text, 360);
    if (!normalized) return;

    const normalizedGroupId =
      typeof groupId === 'string' && groupId.trim() ? normalizeText(groupId, 24) : 'G0';
    const key = normalizedGroupId + ':' + kind + ':' + normalized.toLowerCase();
    if (textSeen.has(key)) return;
    textSeen.add(key);

    const block = {
      id: 'T' + (textBlocks.length + 1),
      kind,
      text: normalized,
      source: normalizeText(source || '', 200),
      groupId: normalizedGroupId,
    };

    if (typeof level === 'number') block.level = level;
    textBlocks.push(block);
  };

  const textRows = [];
  const headingNodes = Array.from(document.querySelectorAll('h1, h2, h3, h4, h5, h6'));
  for (const heading of headingNodes) {
    const visibility = getVisibility(heading);
    if (visibility.hidden || visibility.offscreen) continue;
    const headingText = getElementText(heading, 280);
    if (!headingText) continue;

    const level = Number.parseInt(heading.tagName.slice(1), 10);
    textRows.push({
      kind: 'heading',
      text: headingText,
      source: buildCssPath(heading),
      level: Number.isFinite(level) ? level : undefined,
      groupId: getGroupId(heading),
      bbox: {
        x: visibility.rect.x,
        y: visibility.rect.y,
        width: visibility.rect.width,
        height: visibility.rect.height,
      },
    });
  }

  const textSelectors = ['main p', 'article p', '[role="main"] p', 'section p', 'p', 'li'];
  const textCandidates = Array.from(document.querySelectorAll(textSelectors.join(',')));
  for (const node of textCandidates) {
    const visibility = getVisibility(node);
    if (visibility.hidden || visibility.offscreen) continue;

    const text = getElementText(node, 360);
    if (!text || text.length < 28) continue;

    textRows.push({
      kind: 'text',
      text,
      source: buildCssPath(node),
      groupId: getGroupId(node),
      bbox: {
        x: visibility.rect.x,
        y: visibility.rect.y,
        width: visibility.rect.width,
        height: visibility.rect.height,
      },
    });
  }

  textRows.sort(sortByPosition);
  for (const row of textRows) {
    if (textBlocks.length >= options.maxTextBlocks * 2) break;
    addTextBlock(row.kind, row.text, row.source, row.groupId, row.level);
  }

  const totalTextBlockCount = textBlocks.length;
  const trimmedTextBlocks = textBlocks.slice(0, options.maxTextBlocks);

  const formRows = [];
  const formNodes = Array.from(document.querySelectorAll('form'));
  for (const formNode of formNodes) {
    const visibility = getVisibility(formNode);
    if (visibility.hidden || visibility.offscreen) continue;

    const fieldNodes = Array.from(formNode.querySelectorAll('input, select, textarea'));
    const fields = [];
    for (const field of fieldNodes) {
      const type = normalizeText(field.getAttribute('type') || '', 40).toLowerCase();
      if (type === 'hidden') continue;
      const fieldName =
        getName(field) ||
        normalizeText(field.getAttribute('name') || '', 80) ||
        normalizeText(field.getAttribute('id') || '', 80) ||
        normalizeText(field.tagName.toLowerCase(), 40);
      if (fieldName && !fields.includes(fieldName)) fields.push(fieldName);
    }

    const submitNodes = Array.from(
      formNode.querySelectorAll(
        'button[type="submit"], button:not([type]), input[type="submit"], input[type="image"]'
      )
    );
    const submitButtons = [];
    for (const submitNode of submitNodes) {
      const submitName = getName(submitNode) || normalizeText(submitNode.tagName.toLowerCase(), 40);
      if (submitName && !submitButtons.includes(submitName)) submitButtons.push(submitName);
    }

    const formName =
      normalizeText(formNode.getAttribute('aria-label') || '', 100) ||
      normalizeText(formNode.getAttribute('name') || '', 100) ||
      normalizeText(formNode.getAttribute('id') || '', 100) ||
      'form';

    formRows.push({
      name: formName,
      fields,
      submitButtons,
      bbox: {
        x: visibility.rect.x,
        y: visibility.rect.y,
        width: visibility.rect.width,
        height: visibility.rect.height,
      },
    });
  }
  formRows.sort(sortByPosition);
  const forms = formRows.map((row, index) => ({
    id: 'F' + (index + 1),
    name: row.name,
    fields: row.fields,
    submitButtons: row.submitButtons,
  }));

  const mediaRows = [];
  const mediaNodes = Array.from(document.querySelectorAll('audio, video'));
  for (const mediaNode of mediaNodes) {
    const visibility = getVisibility(mediaNode);
    if (visibility.hidden || visibility.offscreen) continue;

    const kind = mediaNode.tagName.toLowerCase() === 'video' ? 'video' : 'audio';
    const state = [];
    if (mediaNode.ended) state.push('ended');
    else if (mediaNode.paused) state.push('paused');
    else state.push('playing');
    if (mediaNode.muted || mediaNode.volume === 0) state.push('muted');
    if (mediaNode.controls) state.push('controls');

    const currentTime = Number.isFinite(mediaNode.currentTime)
      ? Number.parseFloat(mediaNode.currentTime.toFixed(3))
      : 0;
    const duration = Number.isFinite(mediaNode.duration)
      ? Number.parseFloat(mediaNode.duration.toFixed(3))
      : -1;
    const src = normalizeText(mediaNode.currentSrc || mediaNode.getAttribute('src') || '', 320);
    const name =
      getName(mediaNode) ||
      normalizeText(mediaNode.getAttribute('title') || '', 120) ||
      normalizeText(src, 120) ||
      kind;

    const row = {
      kind,
      name,
      state,
      locator: getLocator(mediaNode),
      bbox: {
        x: visibility.rect.x,
        y: visibility.rect.y,
        width: visibility.rect.width,
        height: visibility.rect.height,
      },
      currentTime,
      duration,
    };

    if (src) row.src = src;
    mediaRows.push(row);
  }

  mediaRows.sort(sortByPosition);
  const media = mediaRows.map((row, index) => ({
    id: 'M' + (index + 1),
    ...row,
  }));

  const alerts = [];
  const addAlert = (text) => {
    const normalized = normalizeText(text, 240);
    if (!normalized) return;
    if (!alerts.includes(normalized)) alerts.push(normalized);
  };

  const alertNodes = Array.from(
    document.querySelectorAll(
      '[role="alert"], [role="status"], [aria-live="assertive"], [aria-live="polite"]'
    )
  );
  for (const alertNode of alertNodes) {
    const visibility = getVisibility(alertNode);
    if (visibility.hidden || visibility.offscreen) continue;
    addAlert(getElementText(alertNode, 240));
  }

  const warnings = [];
  const iframeCount = document.querySelectorAll('iframe').length;
  if (iframeCount > 0) warnings.push('Iframe contents are not expanded in this snapshot.');

  const page = {
    url: location.href,
    title: document.title || '',
    lang: document.documentElement.lang || '',
    capturedAt: new Date().toISOString(),
    viewport: {
      width: toInt(window.innerWidth || document.documentElement.clientWidth || 0),
      height: toInt(window.innerHeight || document.documentElement.clientHeight || 0),
    },
    scroll: {
      x: toInt(window.scrollX || window.pageXOffset || 0),
      y: toInt(window.scrollY || window.pageYOffset || 0),
      maxY: toInt(
        Math.max(
          0,
          (document.documentElement.scrollHeight || 0) -
            (window.innerHeight || document.documentElement.clientHeight || 0)
        )
      ),
    },
  };

  const summary = {
    interactiveCount: interactive.length,
    totalInteractiveCount,
    textBlockCount: trimmedTextBlocks.length,
    totalTextBlockCount,
    formCount: forms.length,
    mediaCount: media.length,
    alertCount: alerts.length,
    totalLinks: document.querySelectorAll('a[href]').length,
    totalButtons: document.querySelectorAll('button, input[type="button"], input[type="submit"]').length,
    totalInputs: document.querySelectorAll('input, select, textarea, [contenteditable="true"], [contenteditable=""]').length,
  };

  const truncation = {
    interactive: totalInteractiveCount > interactive.length,
    textBlocks: totalTextBlockCount > trimmedTextBlocks.length,
    hiddenFilteredCount,
    offscreenFilteredCount,
  };

  return {
    page,
    summary,
    interactive,
    textBlocks: trimmedTextBlocks,
    forms,
    media,
    alerts: alerts.slice(0, 25),
    truncation,
    warnings,
  };
})()
`.trim();
}
