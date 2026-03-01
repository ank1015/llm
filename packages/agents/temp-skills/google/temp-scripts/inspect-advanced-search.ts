#!/usr/bin/env -S node --enable-source-maps

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { connect, Window } from '@ank1015/llm-extension';

type AdvancedInspectOptions = {
  query?: string;
  exactPhrase?: string;
  anyWords?: string;
  noneWords?: string;
  siteOrDomain?: string;
  fileType?: string;
  language?: string;
  region?: string;
  max: number;
  keepWindow: boolean;
  focused: boolean;
};

const DEFAULT_MAX = 120;
const DEFAULT_LANGUAGE = 'lang_en';
const DEFAULT_REGION = 'countryUS';

const ADVANCED_PAGE_PROBE_SCRIPT = String.raw`(() => {
  const compact = (value) => String(value || '').replace(/\s+/g, ' ').trim();

  const forms = Array.from(document.querySelectorAll('form')).map((form, index) => {
    if (!(form instanceof HTMLFormElement)) return null;
    const controls = Array.from(form.querySelectorAll('input,select,textarea,button'))
      .map((node) => {
        if (!(node instanceof HTMLElement)) return null;
        const tag = node.tagName.toLowerCase();
        const base = {
          tag,
          id: node.getAttribute('id') || '',
          name: node.getAttribute('name') || '',
          ariaLabel: node.getAttribute('aria-label') || '',
          placeholder: node.getAttribute('placeholder') || '',
          type: ''
        };

        if (node instanceof HTMLInputElement) {
          return { ...base, type: node.type || 'text' };
        }
        if (node instanceof HTMLSelectElement) {
          return {
            ...base,
            type: 'select',
            options: Array.from(node.options).slice(0, 12).map((opt) => ({
              value: opt.value,
              label: compact(opt.label),
              selected: opt.selected
            }))
          };
        }
        if (node instanceof HTMLTextAreaElement) {
          return { ...base, type: 'textarea' };
        }
        if (node instanceof HTMLButtonElement) {
          return { ...base, type: node.type || 'button', text: compact(node.textContent || '') };
        }

        return base;
      })
      .filter(Boolean);

    const submitButtons = controls
      .filter((control) => control.tag === 'button' || control.type === 'submit')
      .slice(0, 20);

    return {
      index,
      id: form.id || '',
      action: form.getAttribute('action') || '',
      method: form.getAttribute('method') || '',
      controlCount: controls.length,
      submitButtons,
      controls: controls.slice(0, 80)
    };
  }).filter(Boolean);

  const knownAdvancedFields = {
    allWords: document.querySelector('input[name="as_q"]') !== null,
    exactPhrase: document.querySelector('input[name="as_epq"]') !== null,
    anyWords: document.querySelector('input[name="as_oq"]') !== null,
    noneWords: document.querySelector('input[name="as_eq"]') !== null,
    numbersFrom: document.querySelector('input[name="as_nlo"]') !== null,
    numbersTo: document.querySelector('input[name="as_nhi"]') !== null,
    language: document.querySelector('select[name="lr"]') !== null,
    region: document.querySelector('select[name="cr"]') !== null,
    lastUpdate: document.querySelector('select[name="as_qdr"]') !== null,
    siteOrDomain: document.querySelector('input[name="as_sitesearch"]') !== null,
    fileType: document.querySelector('select[name="as_filetype"]') !== null
  };

  return {
    location: window.location.href,
    title: document.title,
    timestamp: new Date().toISOString(),
    formCount: forms.length,
    forms,
    knownAdvancedFields
  };
})()`;

function parseArgs(argv: string[]): AdvancedInspectOptions {
  let query: string | undefined;
  let exactPhrase: string | undefined;
  let anyWords: string | undefined;
  let noneWords: string | undefined;
  let siteOrDomain: string | undefined;
  let fileType: string | undefined;
  let language = DEFAULT_LANGUAGE;
  let region = DEFAULT_REGION;
  let max = DEFAULT_MAX;
  let keepWindow = false;
  let focused = false;

  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--query' || arg === '-q') {
      query = argv[index + 1];
      index++;
      continue;
    }
    if (arg === '--exact') {
      exactPhrase = argv[index + 1];
      index++;
      continue;
    }
    if (arg === '--any') {
      anyWords = argv[index + 1];
      index++;
      continue;
    }
    if (arg === '--none') {
      noneWords = argv[index + 1];
      index++;
      continue;
    }
    if (arg === '--site') {
      siteOrDomain = argv[index + 1];
      index++;
      continue;
    }
    if (arg === '--filetype') {
      fileType = argv[index + 1];
      index++;
      continue;
    }
    if (arg === '--language') {
      language = argv[index + 1] || DEFAULT_LANGUAGE;
      index++;
      continue;
    }
    if (arg === '--region') {
      region = argv[index + 1] || DEFAULT_REGION;
      index++;
      continue;
    }
    if (arg === '--max') {
      const parsed = Number.parseInt(argv[index + 1] ?? '', 10);
      if (!Number.isInteger(parsed) || parsed < 0) {
        throw new Error('--max must be a non-negative integer');
      }
      max = parsed;
      index++;
      continue;
    }
    if (arg === '--keep-window') {
      keepWindow = true;
      continue;
    }
    if (arg === '--focused') {
      focused = true;
      continue;
    }
    if (!arg.startsWith('-') && !query) {
      query = arg;
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  return {
    ...(query?.trim() ? { query: query.trim() } : {}),
    ...(exactPhrase?.trim() ? { exactPhrase: exactPhrase.trim() } : {}),
    ...(anyWords?.trim() ? { anyWords: anyWords.trim() } : {}),
    ...(noneWords?.trim() ? { noneWords: noneWords.trim() } : {}),
    ...(siteOrDomain?.trim() ? { siteOrDomain: siteOrDomain.trim() } : {}),
    ...(fileType?.trim() ? { fileType: fileType.trim() } : {}),
    language: language.trim() || DEFAULT_LANGUAGE,
    region: region.trim() || DEFAULT_REGION,
    max,
    keepWindow,
    focused,
  };
}

function formatTimestamp(date = new Date()): string {
  const pad = (value: number): string => String(value).padStart(2, '0');
  return [
    date.getFullYear(),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    '-',
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
  ].join('');
}

function slugify(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'advanced';
}

function buildAdvancedSearchUrl(options: AdvancedInspectOptions): string {
  const params = new URLSearchParams();
  params.set('hl', 'en');

  if (options.query) params.set('as_q', options.query);
  if (options.exactPhrase) params.set('as_epq', options.exactPhrase);
  if (options.anyWords) params.set('as_oq', options.anyWords);
  if (options.noneWords) params.set('as_eq', options.noneWords);
  if (options.siteOrDomain) params.set('as_sitesearch', options.siteOrDomain);
  if (options.fileType) params.set('as_filetype', options.fileType);
  if (options.language) params.set('lr', options.language);
  if (options.region) params.set('cr', options.region);

  return `https://www.google.com/advanced_search?${params.toString()}`;
}

function usage(scriptPath: string): void {
  const usageText = [
    `Usage: ${scriptPath} [options]`,
    '',
    'Options:',
    '  --query, -q      All these words (maps to as_q)',
    '  --exact          Exact phrase (maps to as_epq)',
    '  --any            Any of these words (maps to as_oq)',
    '  --none           None of these words (maps to as_eq)',
    '  --site           Site/domain filter (maps to as_sitesearch)',
    '  --filetype       File type filter (maps to as_filetype)',
    `  --language       Language code for lr (default: ${DEFAULT_LANGUAGE})`,
    `  --region         Region code for cr (default: ${DEFAULT_REGION})`,
    `  --max            observe() item limit (default: ${DEFAULT_MAX})`,
    '  --focused        Open created window as focused',
    '  --keep-window    Do not close created window at end',
    '',
    'Example:',
    `  ${scriptPath} --query "llm agents" --site github.com --filetype pdf`,
  ].join('\n');
  console.error(usageText);
}

async function main(): Promise<void> {
  let options: AdvancedInspectOptions;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    usage(process.argv[1] ?? 'inspect-advanced-search.ts');
    throw error;
  }

  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const artifactsDir = resolve(scriptDir, '..', 'artifacts');
  await mkdir(artifactsDir, { recursive: true });

  const targetUrl = buildAdvancedSearchUrl(options);
  const chromePort = process.env.CHROME_RPC_PORT
    ? Number.parseInt(process.env.CHROME_RPC_PORT, 10)
    : undefined;
  const chrome = await connect({
    launch: true,
    ...(chromePort ? { port: chromePort } : {}),
  });

  let createdWindowId: number | undefined;
  try {
    const created = (await chrome.call('windows.create', {
      url: 'about:blank',
      focused: options.focused,
    })) as { id?: number };

    if (typeof created.id !== 'number') {
      throw new Error('windows.create did not return a valid id');
    }
    createdWindowId = created.id;

    const window = new Window(createdWindowId);
    await window.ready;

    const openedTab = await window.open(targetUrl, {
      newTab: false,
      active: true,
      timeoutMs: 30_000,
    });
    const tabId = typeof openedTab.id === 'number' ? openedTab.id : undefined;

    const observeMarkdown = await window.observe({
      ...(typeof tabId === 'number' ? { tabId } : {}),
      max: options.max,
      timeoutMs: 30_000,
    });
    const screenshotBase64 = await window.screenshot({
      ...(typeof tabId === 'number' ? { tabId } : {}),
    });
    const probe = await window.evaluate<Record<string, unknown>>(ADVANCED_PAGE_PROBE_SCRIPT, {
      ...(typeof tabId === 'number' ? { tabId } : {}),
      timeoutMs: 20_000,
    });

    const timestamp = formatTimestamp();
    const querySlug = slugify(options.query || options.exactPhrase || 'advanced-search');
    const baseName = `google-advanced-search-${querySlug.slice(0, 70)}-${timestamp}`;
    const observePath = resolve(artifactsDir, `${baseName}.observe.md`);
    const probePath = resolve(artifactsDir, `${baseName}.probe.json`);
    const screenshotPath = resolve(artifactsDir, `${baseName}.png`);
    const metaPath = resolve(artifactsDir, `${baseName}.meta.json`);

    const meta = {
      targetUrl,
      createdWindowId,
      tabId,
      timestamp: new Date().toISOString(),
      options,
    };

    await Promise.all([
      writeFile(observePath, observeMarkdown, 'utf8'),
      writeFile(probePath, `${JSON.stringify(probe, null, 2)}\n`, 'utf8'),
      writeFile(screenshotPath, Buffer.from(screenshotBase64, 'base64')),
      writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf8'),
    ]);

    console.log('Google advanced-search inspection complete.');
    console.log(`URL: ${targetUrl}`);
    console.log(`Window ID: ${createdWindowId}`);
    if (typeof tabId === 'number') {
      console.log(`Tab ID: ${tabId}`);
    }
    console.log(`Observe markdown: ${observePath}`);
    console.log(`Probe JSON: ${probePath}`);
    console.log(`Screenshot: ${screenshotPath}`);
    console.log(`Metadata: ${metaPath}`);
  } finally {
    if (!options.keepWindow && typeof createdWindowId === 'number') {
      try {
        await chrome.call('windows.remove', createdWindowId);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}

try {
  await main();
} catch (error: unknown) {
  const message = error instanceof Error ? error.stack || error.message : String(error);
  console.error(message);
  process.exitCode = 1;
}
