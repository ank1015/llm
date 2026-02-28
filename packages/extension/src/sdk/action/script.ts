import type { WindowActionExecutionResult, WindowActionScriptPayload } from './types.js';

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

export function buildActionScript(payload: WindowActionScriptPayload): string {
  const serializedPayload = JSON.stringify(payload);

  return `
(() => {
  const payload = ${serializedPayload};

  const normalizeText = (value, maxLength = 180) => {
    if (typeof value !== 'string') return '';
    const compact = value.replace(/\\s+/g, ' ').trim();
    if (!compact) return '';
    if (compact.length <= maxLength) return compact;
    return compact.slice(0, Math.max(1, maxLength - 3)) + '...';
  };

  const result = (success, action, message, selectorUsed) => ({
    success,
    action,
    message,
    selectorUsed: selectorUsed || '',
  });

  const resolveElement = (selectors) => {
    if (!Array.isArray(selectors)) {
      return { element: null, selectorUsed: '' };
    }

    for (const selector of selectors) {
      if (typeof selector !== 'string' || !selector.trim()) {
        continue;
      }

      try {
        const element = document.querySelector(selector);
        if (element) {
          return {
            element,
            selectorUsed: selector,
          };
        }
      } catch {
        // Ignore invalid selectors and keep trying.
      }
    }

    return { element: null, selectorUsed: '' };
  };

  const focusElement = (element) => {
    if (typeof element.focus === 'function') {
      element.focus();
    }
  };

  const scrollIntoView = (element, behavior = 'auto') => {
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'center', inline: 'nearest', behavior });
    }
  };

  const dispatchInputEvents = (element) => {
    element.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  };

  const isContentEditable = (element) => {
    if (!element) return false;
    if (element.isContentEditable) return true;
    const attr =
      typeof element.getAttribute === 'function' ? element.getAttribute('contenteditable') : null;
    if (typeof attr !== 'string') return false;
    const normalized = attr.trim().toLowerCase();
    return normalized === '' || normalized === 'true' || normalized === 'plaintext-only';
  };

  const getTypeableElement = (element) => {
    if (!element) return null;
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      return element;
    }
    if (isContentEditable(element)) {
      return element;
    }
    const nested = element.querySelector(
      'input:not([type="hidden"]), textarea, [contenteditable], [role="textbox"], [role="searchbox"], [role="combobox"]'
    );
    if (!nested) return null;
    if (nested instanceof HTMLInputElement || nested instanceof HTMLTextAreaElement) return nested;
    if (isContentEditable(nested)) return nested;
    return null;
  };

  const setInputValue = (element, value) => {
    const prototype = Object.getPrototypeOf(element);
    const descriptor =
      Object.getOwnPropertyDescriptor(prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value') ||
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value');

    if (descriptor && typeof descriptor.set === 'function') {
      descriptor.set.call(element, value);
    } else {
      element.value = value;
    }
  };

  const clickElement = (element) => {
    focusElement(element);
    element.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('pointerup', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }));
    if (typeof element.click === 'function') {
      element.click();
    } else {
      element.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    }
  };

  const hoverElement = (element) => {
    element.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mouseenter', { bubbles: true, cancelable: true }));
    element.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, cancelable: true }));
  };

  const pressEnter = (element) => {
    focusElement(element);
    const eventInit = {
      key: 'Enter',
      code: 'Enter',
      keyCode: 13,
      which: 13,
      bubbles: true,
      cancelable: true,
    };
    element.dispatchEvent(new KeyboardEvent('keydown', eventInit));
    element.dispatchEvent(new KeyboardEvent('keypress', eventInit));
    element.dispatchEvent(new KeyboardEvent('keyup', eventInit));

    const form = typeof element.closest === 'function' ? element.closest('form') : null;
    if (form && typeof form.requestSubmit === 'function') {
      form.requestSubmit();
    }
  };

  const action = payload.action;
  const resolved = resolveElement(payload.selectors || []);
  const element = resolved.element;
  const selectorUsed = resolved.selectorUsed;

  try {
    if (action === 'scroll') {
      if (element) {
        scrollIntoView(element, payload.scroll?.behavior || 'auto');
        return result(true, action, 'Scrolled target into view', selectorUsed);
      }

      if (payload.scroll && payload.scroll.to) {
        const behavior = payload.scroll.behavior || 'auto';
        if (payload.scroll.to === 'top') {
          window.scrollTo({ top: 0, behavior });
          return result(true, action, 'Scrolled page to top', '');
        }
        if (payload.scroll.to === 'bottom') {
          window.scrollTo({
            top: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
            behavior,
          });
          return result(true, action, 'Scrolled page to bottom', '');
        }
        if (payload.scroll.to === 'left') {
          window.scrollTo({ left: 0, behavior });
          return result(true, action, 'Scrolled page to left edge', '');
        }
        if (payload.scroll.to === 'right') {
          window.scrollTo({
            left: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
            behavior,
          });
          return result(true, action, 'Scrolled page to right edge', '');
        }
      }

      const x = typeof payload.scroll?.x === 'number' ? payload.scroll.x : 0;
      const y =
        typeof payload.scroll?.y === 'number' ? payload.scroll.y : Math.round(window.innerHeight * 0.8);
      window.scrollBy({
        left: x,
        top: y,
        behavior: payload.scroll?.behavior || 'auto',
      });
      return result(true, action, 'Scrolled page', '');
    }

    if (!element) {
      return result(false, action, 'Target element not found', '');
    }

    scrollIntoView(element, 'auto');

    if (action === 'focus') {
      focusElement(element);
      const active = document.activeElement;
      const focused = active === element || element.contains(active);
      return result(focused, action, focused ? 'Focused target element' : 'Focus had no effect', selectorUsed);
    }

    if (action === 'hover') {
      hoverElement(element);
      return result(true, action, 'Hovered target element', selectorUsed);
    }

    if (action === 'click') {
      clickElement(element);
      return result(true, action, 'Clicked target element', selectorUsed);
    }

    if (action === 'pressEnter') {
      pressEnter(element);
      return result(true, action, 'Pressed Enter on target element', selectorUsed);
    }

    if (action === 'toggle') {
      const type = normalizeText(element.getAttribute('type') || '', 40).toLowerCase();
      if (type === 'checkbox' || type === 'radio') {
        clickElement(element);
        return result(true, action, 'Toggled input', selectorUsed);
      }

      if (element.getAttribute('aria-pressed') !== null) {
        clickElement(element);
        return result(true, action, 'Toggled aria-pressed control', selectorUsed);
      }

      return result(false, action, 'Toggle requires checkbox, radio, or aria-pressed control', selectorUsed);
    }

    if (action === 'clear') {
      const typeable = getTypeableElement(element);
      if (!typeable) {
        return result(false, action, 'Clear requires an editable target', selectorUsed);
      }

      focusElement(typeable);
      if (isContentEditable(typeable)) {
        typeable.textContent = '';
        dispatchInputEvents(typeable);
        return result(true, action, 'Cleared editable target', selectorUsed);
      }

      setInputValue(typeable, '');
      dispatchInputEvents(typeable);
      return result(true, action, 'Cleared input value', selectorUsed);
    }

    if (action === 'type') {
      if (typeof payload.value !== 'string') {
        return result(false, action, 'Type requires a string value', selectorUsed);
      }

      const typeable = getTypeableElement(element);
      if (!typeable) {
        return result(false, action, 'Type requires an editable target', selectorUsed);
      }

      focusElement(typeable);
      const clearBeforeType = payload.clearBeforeType !== false;
      const value = payload.value;

      if (isContentEditable(typeable)) {
        const previous = typeof typeable.textContent === 'string' ? typeable.textContent : '';
        typeable.textContent = clearBeforeType ? value : previous + value;
        dispatchInputEvents(typeable);
      } else {
        const previous = typeof typeable.value === 'string' ? typeable.value : '';
        setInputValue(typeable, clearBeforeType ? value : previous + value);
        dispatchInputEvents(typeable);
      }

      if (payload.pressEnter) {
        pressEnter(typeable);
      }

      return result(
        true,
        action,
        payload.pressEnter ? 'Typed into target and pressed Enter' : 'Typed into target',
        selectorUsed
      );
    }

    if (action === 'select') {
      if (typeof payload.value !== 'string') {
        return result(false, action, 'Select requires a string value', selectorUsed);
      }

      const selectElement =
        element instanceof HTMLSelectElement
          ? element
          : element.querySelector('select');

      if (!(selectElement instanceof HTMLSelectElement)) {
        return result(false, action, 'Select requires a <select> target', selectorUsed);
      }

      const value = payload.value;
      const normalized = normalizeText(value, 180).toLowerCase();
      const matched =
        Array.from(selectElement.options).find((option) => option.value === value) ||
        Array.from(selectElement.options).find(
          (option) => normalizeText(option.textContent || '', 180).toLowerCase() === normalized
        ) ||
        Array.from(selectElement.options).find((option) =>
          normalizeText(option.textContent || '', 180).toLowerCase().includes(normalized)
        );

      if (!matched) {
        return result(false, action, 'No matching select option found', selectorUsed);
      }

      selectElement.value = matched.value;
      dispatchInputEvents(selectElement);

      return result(true, action, 'Selected option', selectorUsed);
    }

    return result(false, action, 'Unsupported action type', selectorUsed);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return result(false, action, message, selectorUsed);
  }
})()
`.trim();
}

export function parseActionExecutionResult(raw: unknown): WindowActionExecutionResult {
  if (!isObject(raw)) {
    throw new Error('Action returned an invalid payload');
  }

  const success = raw.success;
  const action = raw.action;
  const message = raw.message;
  const selectorUsed = raw.selectorUsed;

  if (typeof success !== 'boolean' || typeof action !== 'string' || typeof message !== 'string') {
    throw new Error('Action payload is missing required fields');
  }

  const parsed: WindowActionExecutionResult = {
    success,
    action,
    message,
  };

  if (typeof selectorUsed === 'string') {
    parsed.selectorUsed = selectorUsed;
  }

  return parsed;
}
