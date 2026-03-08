import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import { connect } from '@ank1015/llm-extension';

import type { ChromeClient } from '@ank1015/llm-extension';

const LOG_PREFIX = '[google:getSearch]';
const DEFAULT_TIMEOUT_MS = 45_000;
const DEFAULT_LIMIT = 10;
const ADVANCED_SEARCH_URL = 'https://www.google.com/advanced_search';
const MAX_PAGE_VISITS = 20;

type SearchMode = 'simple' | 'advanced' | 'mixed';

interface CliOptions {
  help: boolean;
  query: string;
  allWords: string;
  exactPhrase: string;
  anyWords: string;
  noneWords: string;
  numbersFrom: string;
  numbersTo: string;
  language: string;
  region: string;
  siteOrDomain: string;
  termsAppearing: string;
  fileType: string;
  timeRelative: string;
  limit: number;
  start: number;
  includeSponsored: boolean;
  tabId: number | null;
  timeoutMs: number;
  jsonOutput: string;
}

interface ChromeTab {
  id?: number;
  status?: string;
  title?: string;
  url?: string;
  windowId?: number;
}

interface DebuggerEvaluateResponse<T> {
  result?: T;
  type?: string;
}

interface ExtractedResultItem {
  rankOnPage: number;
  kind: 'organic' | 'sponsored';
  sponsored: boolean;
  title: string;
  url: string;
  source: string;
  description: string;
  date: string;
}

interface ExtractedPageResult {
  page: {
    url: string;
    query: string;
    start: number;
    title: string;
    blockReason: string;
    noResults: boolean;
    bodySample: string;
  };
  items: ExtractedResultItem[];
}

interface SearchResultItem extends ExtractedResultItem {
  globalRank: number;
  pageIndex: number;
  pageNumber: number;
  pageStart: number;
}

interface SearchPageVisit {
  pageNumber: number;
  start: number;
  url: string;
  title: string;
  returned: number;
}

interface SearchRunResult {
  tabId: number;
  mode: SearchMode;
  searchSummary: string;
  requested: number;
  returned: number;
  includeSponsored: boolean;
  start: number;
  jsonOutputPath?: string;
  pagesVisited: number;
  activeUrl: string;
  pages: SearchPageVisit[];
  results: SearchResultItem[];
}

const EXTRACT_SERP = String.raw`(() => {
  const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();
  const decodeHref = (href) => {
    try {
      const url = new URL(href || '', window.location.href);
      if (url.pathname === '/url') {
        return url.searchParams.get('q') || url.searchParams.get('url') || '';
      }
      return url.toString();
    } catch {
      return '';
    }
  };
  const isResultUrl = (url) =>
    /^https?:/i.test(url) && !/^https?:\/\/(?:www\.)?google\.[^/]+\/search/i.test(url);
  const pick = (node, selectors) => {
    for (const selector of selectors) {
      const hit = node.querySelector(selector);
      if (hit) {
        const text = clean(hit.textContent || '');
        if (text) return text;
      }
    }
    return '';
  };
  const isSponsored = (node) => {
    const text = clean(node.textContent || '').slice(0, 260);
    return (
      /\b(sponsored|ad|ads)\b/i.test(text) ||
      Boolean(node.querySelector('[aria-label*="Sponsored" i], [aria-label*="Ad" i], [data-text-ad]'))
    );
  };
  const splitDateAndDescription = (value) => {
    const text = clean(value);
    if (!text) return { date: '', description: '' };

    const patterns = [
      /^((?:\d+\s+(?:minute|hour|day|week|month|year)s?\s+ago))\s*[·\-—]\s*(.+)$/i,
      /^((?:[A-Z][a-z]{2,8}\s+\d{1,2},\s+\d{4}))\s*[·\-—]\s*(.+)$/,
      /^((?:\d{1,2}\s+[A-Z][a-z]{2,8}\s+\d{4}))\s*[·\-—]\s*(.+)$/,
    ];

    for (const pattern of patterns) {
      const match = text.match(pattern);
      if (match) {
        return {
          date: clean(match[1]),
          description: clean(match[2]),
        };
      }
    }

    return { date: '', description: text };
  };

  const selectors = ['#search div.MjjYud', '#search div.g', '#search [data-sokoban-container]'];
  const seenNodes = new Set();
  const seenUrls = new Set();
  const items = [];

  for (const selector of selectors) {
    for (const node of document.querySelectorAll(selector)) {
      if (!(node instanceof HTMLElement) || seenNodes.has(node)) {
        continue;
      }
      seenNodes.add(node);

      const title = pick(node, ['h3', '[role="heading"]']);
      const anchor = node.querySelector('a[href]');
      const url = decodeHref(anchor ? anchor.getAttribute('href') : '');
      if (!title || !isResultUrl(url) || seenUrls.has(url)) {
        continue;
      }
      seenUrls.add(url);

      const rawDescription = pick(node, [
        'div.VwiC3b',
        'span.aCOpRe',
        'div[data-sncf]',
        '.st',
        '[data-content-feature="1"]',
      ]);
      const explicitDate = pick(node, [
        'span.MUxGbd.wuQ4Ob.WZ8Tjf',
        'span.LEwnzc',
        'span.r2fjmd',
        'div.osrp-blk div span',
      ]);
      const split = splitDateAndDescription(rawDescription);
      const date = explicitDate || split.date;

      items.push({
        rankOnPage: items.length + 1,
        kind: isSponsored(node) ? 'sponsored' : 'organic',
        sponsored: isSponsored(node),
        title,
        url,
        source: pick(node, ['cite', 'span.VuuXrf', 'div.yuRUbf span']),
        description: split.description,
        date,
      });
    }
  }

  const pageUrl = new URL(window.location.href);
  const bodySample = clean(document.body ? document.body.innerText || '' : '').slice(0, 1000);
  const title = document.title;
  const lowerTitle = title.toLowerCase();
  const lowerBody = bodySample.toLowerCase();
  let blockReason = '';
  const noResults =
    lowerBody.includes('did not match any documents') ||
    lowerBody.includes('no results found for');

  if (
    lowerTitle.includes('403') ||
    lowerBody.includes('403. that’s an error') ||
    lowerBody.includes("403. that's an error")
  ) {
    blockReason = '403';
  } else if (
    lowerBody.includes('our systems have detected unusual traffic') ||
    lowerBody.includes('unusual traffic from your computer network') ||
    lowerBody.includes('sending automated queries')
  ) {
    blockReason = 'unusual_traffic';
  } else if (lowerBody.includes('before you continue to google search')) {
    blockReason = 'consent';
  }

  return {
    page: {
      url: window.location.href,
      query: pageUrl.searchParams.get('q') || '',
      start: Number.parseInt(pageUrl.searchParams.get('start') || '0', 10) || 0,
      title,
      blockReason,
      noResults,
      bodySample,
    },
    items,
  };
})()`;

const GO_TO_NEXT_RESULTS_PAGE_CODE = String.raw`(() => {
  const nextLink =
    document.querySelector('a#pnnext') ||
    Array.from(document.querySelectorAll('a[href]')).find((node) => {
      const text = String(node.textContent || '').replace(/\s+/g, ' ').trim().toLowerCase();
      return text === 'next';
    });

  if (!(nextLink instanceof HTMLElement)) {
    return { advanced: false };
  }

  setTimeout(() => {
    nextLink.click();
  }, 0);

  return { advanced: true };
})()`;

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    process.stdout.write(`${buildHelpText()}\n`);
    process.exit(0);
  }

  validateOptions(options);

  const chrome = await connect({ launch: true });
  log('connected');

  const result = await runSearch(chrome, options);

  if (options.jsonOutput) {
    const jsonOutputPath = resolve(process.cwd(), options.jsonOutput);
    await mkdir(dirname(jsonOutputPath), { recursive: true });
    await writeFile(jsonOutputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf-8');
    result.jsonOutputPath = jsonOutputPath;
    log(`wrote json output to ${jsonOutputPath}`);
  }

  process.stdout.write(`${renderMarkdown(result)}\n`);
  process.exit(0);
}

async function runSearch(chrome: ChromeClient, options: CliOptions): Promise<SearchRunResult> {
  const mode = determineSearchMode(options);
  const searchSummary = buildSearchSummary(options);
  const pages: SearchPageVisit[] = [];
  const results: SearchResultItem[] = [];
  const requestedNum = Math.min(100, Math.max(10, options.limit));

  let workingTabId = options.tabId;
  let activeUrl = '';

  if (workingTabId !== null) {
    await callChrome<ChromeTab>(chrome, 'tabs.get', workingTabId);
    log(`using existing tab ${workingTabId}`);
    await callChrome<ChromeTab>(chrome, 'tabs.update', workingTabId, {
      url: ADVANCED_SEARCH_URL,
      active: true,
    });
  }

  if (workingTabId === null) {
    const createdTab = await createWorkingTab(chrome, ADVANCED_SEARCH_URL);
    workingTabId = createdTab.id;
    activeUrl = createdTab.url ?? ADVANCED_SEARCH_URL;
    log(`created new tab ${workingTabId}`);
  }

  await waitForTabLoad(chrome, workingTabId, options.timeoutMs);
  await submitAdvancedSearchForm(chrome, workingTabId, options, requestedNum);
  await waitForTabLoad(chrome, workingTabId, options.timeoutMs);
  await sleep(1_000);

  let currentPage = await extractSearchPage(chrome, workingTabId, options.timeoutMs);
  activeUrl = currentPage.page.url || activeUrl;
  let navigationCount = 0;

  while (currentPage.page.start < options.start && navigationCount < MAX_PAGE_VISITS) {
    const advanced = await goToNextResultsPage(chrome, workingTabId);
    if (!advanced) {
      break;
    }
    navigationCount += 1;
    await waitForTabLoad(chrome, workingTabId, options.timeoutMs);
    await sleep(1_000);
    currentPage = await extractSearchPage(chrome, workingTabId, options.timeoutMs);
    activeUrl = currentPage.page.url || activeUrl;
  }

  for (
    let pageIndex = 0;
    pageIndex < MAX_PAGE_VISITS && results.length < options.limit;
    pageIndex += 1
  ) {
    const pageItems = Array.isArray(currentPage.items) ? currentPage.items : [];
    pages.push({
      pageNumber: pageIndex + 1,
      start: currentPage.page.start,
      url: currentPage.page.url,
      title: currentPage.page.title,
      returned: pageItems.length,
    });

    if (pageItems.length === 0 && currentPage.page.noResults) {
      break;
    }

    for (const item of pageItems) {
      if (!options.includeSponsored && item.sponsored) {
        continue;
      }

      results.push({
        ...item,
        globalRank: results.length + 1,
        pageIndex,
        pageNumber: pageIndex + 1,
        pageStart: currentPage.page.start,
      });

      if (results.length >= options.limit) {
        break;
      }
    }

    if (results.length >= options.limit) {
      break;
    }

    const advanced = await goToNextResultsPage(chrome, workingTabId);
    if (!advanced) {
      break;
    }
    await waitForTabLoad(chrome, workingTabId, options.timeoutMs);
    await sleep(1_000);
    currentPage = await extractSearchPage(chrome, workingTabId, options.timeoutMs);
    activeUrl = currentPage.page.url || activeUrl;
  }

  return {
    tabId: workingTabId,
    mode,
    searchSummary,
    requested: options.limit,
    returned: results.length,
    includeSponsored: options.includeSponsored,
    start: options.start,
    pagesVisited: pages.length,
    activeUrl,
    pages,
    results,
  };
}

async function createWorkingTab(
  chrome: ChromeClient,
  url: string
): Promise<{ id: number; url?: string }> {
  try {
    const created = await callChrome<ChromeTab>(chrome, 'tabs.create', {
      url,
      active: true,
    });
    if (typeof created.id === 'number') {
      return typeof created.url === 'string'
        ? { id: created.id, url: created.url }
        : { id: created.id };
    }
  } catch (error) {
    log(`tabs.create failed, falling back to windows.create: ${stringifyError(error)}`);
  }

  const createdWindow = await callChrome<{ tabs?: ChromeTab[] }>(chrome, 'windows.create', {
    url,
    focused: true,
    type: 'normal',
  });
  const createdTabId = createdWindow.tabs?.[0]?.id;

  if (typeof createdTabId !== 'number') {
    throw new Error('Failed to create a working tab');
  }

  return {
    id: createdTabId,
    url,
  };
}

async function extractSearchPage(
  chrome: ChromeClient,
  tabId: number,
  timeoutMs: number
): Promise<ExtractedPageResult> {
  const deadline = Date.now() + timeoutMs;
  let lastResult: ExtractedPageResult | null = null;

  while (Date.now() < deadline) {
    const evaluation = await callChrome<DebuggerEvaluateResponse<ExtractedPageResult>>(
      chrome,
      'debugger.evaluate',
      {
        tabId,
        code: EXTRACT_SERP,
        awaitPromise: true,
        userGesture: true,
      }
    );
    const result = evaluation.result;
    if (result && Array.isArray(result.items)) {
      if (result.page.blockReason) {
        throw new Error(
          [
            `Google returned a blocked page (${result.page.blockReason})`,
            `title: ${result.page.title || 'unknown'}`,
            `url: ${result.page.url || 'unknown'}`,
            `body: ${result.page.bodySample || 'empty'}`,
          ].join('\n')
        );
      }
      if (result.page.noResults || result.items.length > 0) {
        return result;
      }
      lastResult = result;
    }

    await sleep(500);
  }

  if (lastResult) {
    if (lastResult.page.noResults) {
      return lastResult;
    }
    if (lastResult.page.title || lastResult.page.url) {
      throw new Error(
        [
          'Google search page loaded but no result items were extracted',
          `title: ${lastResult.page.title || 'unknown'}`,
          `url: ${lastResult.page.url || 'unknown'}`,
          `body: ${lastResult.page.bodySample || 'empty'}`,
        ].join('\n')
      );
    }
    return lastResult;
  }

  throw new Error(`Timed out extracting Google search results from tab ${tabId}`);
}

async function submitAdvancedSearchForm(
  chrome: ChromeClient,
  tabId: number,
  options: CliOptions,
  numPerPage: number
): Promise<void> {
  const code = buildAdvancedSearchSubmitCode(options, numPerPage);
  await callChrome(chrome, 'debugger.evaluate', {
    tabId,
    code,
    awaitPromise: true,
    userGesture: true,
  });
}

async function goToNextResultsPage(chrome: ChromeClient, tabId: number): Promise<boolean> {
  const response = await callChrome<DebuggerEvaluateResponse<{ advanced: boolean }>>(
    chrome,
    'debugger.evaluate',
    {
      tabId,
      code: GO_TO_NEXT_RESULTS_PAGE_CODE,
      awaitPromise: true,
      userGesture: true,
    }
  );

  return response.result?.advanced === true;
}

function buildAdvancedSearchSubmitCode(options: CliOptions, numPerPage: number): string {
  const payload = JSON.stringify({
    allWords: options.query || options.allWords,
    exactPhrase: options.exactPhrase,
    anyWords: options.anyWords,
    noneWords: options.noneWords,
    numbersFrom: options.numbersFrom,
    numbersTo: options.numbersTo,
    language: options.language,
    region: options.region,
    siteOrDomain: options.siteOrDomain,
    termsAppearing: options.termsAppearing,
    fileType: options.fileType,
    timeRelative: options.timeRelative,
    numPerPage,
    start: options.start,
  });

  return String.raw`(() => {
    const values = ${payload};
    const setText = (selector, value) => {
      if (!String(value || '').trim()) {
        return true;
      }

      const node = document.querySelector(selector);
      if (!(node instanceof HTMLInputElement || node instanceof HTMLTextAreaElement)) {
        return false;
      }

      node.focus();
      node.value = String(value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const setOrCreateHidden = (form, name, value) => {
      let node = form.querySelector('input[name="' + name + '"]');
      if (!(node instanceof HTMLInputElement)) {
        node = document.createElement('input');
        node.type = 'hidden';
        node.name = name;
        form.appendChild(node);
      }
      node.value = String(value);
      node.dispatchEvent(new Event('input', { bubbles: true }));
      node.dispatchEvent(new Event('change', { bubbles: true }));
      return true;
    };
    const form = document.querySelector('form[action*="/search"]');
    if (!(form instanceof HTMLFormElement)) {
      throw new Error('Google advanced search form not found');
    }

    const applied = {
      as_q: setText('input[name="as_q"]', values.allWords),
      as_epq: setText('input[name="as_epq"]', values.exactPhrase),
      as_oq: setText('input[name="as_oq"]', values.anyWords),
      as_eq: setText('input[name="as_eq"]', values.noneWords),
      as_nlo: setText('input[name="as_nlo"]', values.numbersFrom),
      as_nhi: setText('input[name="as_nhi"]', values.numbersTo),
      as_sitesearch: setText('input[name="as_sitesearch"]', values.siteOrDomain),
      lr: values.language ? setOrCreateHidden(form, 'lr', values.language) : true,
      cr: values.region ? setOrCreateHidden(form, 'cr', values.region) : true,
      as_qdr: values.timeRelative ? setOrCreateHidden(form, 'as_qdr', values.timeRelative) : true,
      as_occt: values.termsAppearing ? setOrCreateHidden(form, 'as_occt', values.termsAppearing) : true,
      as_filetype: values.fileType ? setOrCreateHidden(form, 'as_filetype', values.fileType) : true,
      num: setOrCreateHidden(form, 'num', values.numPerPage),
      start: values.start ? setOrCreateHidden(form, 'start', values.start) : true,
      pws: setOrCreateHidden(form, 'pws', '0'),
    };

    const submitButton =
      form.querySelector('button[type="submit"]') ||
      form.querySelector('input[type="submit"]') ||
      form.querySelector('button');

    setTimeout(() => {
      if (submitButton instanceof HTMLElement) {
        submitButton.click();
      } else {
        form.requestSubmit();
      }
    }, 0);

    return { submitted: true, applied };
  })()`;
}

function determineSearchMode(options: CliOptions): SearchMode {
  const hasQuery = hasText(options.query);
  const hasAdvanced =
    hasText(options.allWords) ||
    hasText(options.exactPhrase) ||
    hasText(options.anyWords) ||
    hasText(options.noneWords) ||
    hasText(options.siteOrDomain) ||
    hasText(options.fileType) ||
    hasText(options.language) ||
    hasText(options.region) ||
    hasText(options.termsAppearing) ||
    hasText(options.numbersFrom) ||
    hasText(options.numbersTo) ||
    hasText(options.timeRelative);

  if (hasQuery && hasAdvanced) {
    return 'mixed';
  }
  if (hasAdvanced) {
    return 'advanced';
  }
  return 'simple';
}

function buildSearchSummary(options: CliOptions): string {
  const parts: string[] = [];

  if (hasText(options.query)) {
    parts.push(options.query.trim());
  }
  if (hasText(options.allWords)) {
    parts.push(`all words: ${options.allWords.trim()}`);
  }
  if (hasText(options.exactPhrase)) {
    parts.push(`exact phrase: "${options.exactPhrase.trim()}"`);
  }
  if (hasText(options.anyWords)) {
    parts.push(`any words: ${options.anyWords.trim()}`);
  }
  if (hasText(options.noneWords)) {
    parts.push(`exclude: ${options.noneWords.trim()}`);
  }
  if (hasText(options.siteOrDomain)) {
    parts.push(`site: ${options.siteOrDomain.trim()}`);
  }
  if (hasText(options.fileType)) {
    parts.push(`file type: ${options.fileType.trim()}`);
  }
  if (hasText(options.timeRelative)) {
    parts.push(`time: ${options.timeRelative.trim()}`);
  }

  return parts.join(' | ');
}

async function waitForTabLoad(
  chrome: ChromeClient,
  tabId: number,
  timeoutMs: number
): Promise<void> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const tab = await callChrome<ChromeTab>(chrome, 'tabs.get', tabId);
    if (tab.status === 'complete') {
      await sleep(250);
      const settled = await callChrome<ChromeTab>(chrome, 'tabs.get', tabId);
      if (settled.status === 'complete') {
        return;
      }
    }
    await sleep(250);
  }

  throw new Error(`Tab ${tabId} did not finish loading within ${timeoutMs}ms`);
}

function parseArgs(argv: string[]): CliOptions {
  const parsed = new Map<string, string>();
  let help = false;

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (typeof token !== 'string') {
      continue;
    }
    if (token === '--help' || token === '-h') {
      help = true;
      continue;
    }
    if (!token.startsWith('--')) {
      throw new Error(`Unexpected argument: ${token}`);
    }

    const withoutPrefix = token.slice(2);
    const equalsIndex = withoutPrefix.indexOf('=');
    if (equalsIndex >= 0) {
      const key = withoutPrefix.slice(0, equalsIndex);
      const value = withoutPrefix.slice(equalsIndex + 1);
      parsed.set(key, value);
      continue;
    }

    const next = argv[index + 1];
    if (typeof next === 'string' && !next.startsWith('--')) {
      parsed.set(withoutPrefix, next);
      index += 1;
      continue;
    }

    parsed.set(withoutPrefix, 'true');
  }

  const includeSponsoredValue = parsed.get('include-sponsored');
  const excludeSponsored = parseBoolean(parsed.get('exclude-sponsored'), false);

  let includeSponsored = parseBoolean(includeSponsoredValue, true);
  if (excludeSponsored) {
    includeSponsored = false;
  }

  return {
    help,
    query: readString(parsed, 'query'),
    allWords: readString(parsed, 'all-words'),
    exactPhrase: readString(parsed, 'exact-phrase'),
    anyWords: readString(parsed, 'any-words'),
    noneWords: readString(parsed, 'none-words'),
    numbersFrom: readString(parsed, 'numbers-from'),
    numbersTo: readString(parsed, 'numbers-to'),
    language: readString(parsed, 'language'),
    region: readString(parsed, 'region'),
    siteOrDomain: readString(parsed, 'site-or-domain'),
    termsAppearing: readString(parsed, 'terms-appearing'),
    fileType: readString(parsed, 'file-type'),
    timeRelative: readString(parsed, 'time-relative'),
    limit: parseInteger(parsed.get('limit'), DEFAULT_LIMIT, 'limit'),
    start: Math.max(0, parseInteger(parsed.get('start'), 0, 'start')),
    includeSponsored,
    tabId: parseOptionalInteger(parsed.get('tab-id'), 'tab-id'),
    timeoutMs: Math.max(
      1_000,
      parseInteger(parsed.get('timeout-ms'), DEFAULT_TIMEOUT_MS, 'timeout-ms')
    ),
    jsonOutput: readString(parsed, 'json-output'),
  };
}

function validateOptions(options: CliOptions): void {
  const hasCoreQuery =
    hasText(options.query) ||
    hasText(options.allWords) ||
    hasText(options.exactPhrase) ||
    hasText(options.anyWords);

  if (!hasCoreQuery) {
    throw new Error(
      'Provide --query or at least one of --all-words, --exact-phrase, or --any-words'
    );
  }

  if (hasText(options.timeRelative) && !/^(d|w|m|y)$/i.test(options.timeRelative.trim())) {
    throw new Error('--time-relative must be one of: d, w, m, y');
  }
}

function readString(parsed: Map<string, string>, key: string): string {
  return parsed.get(key)?.trim() ?? '';
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(normalized)) {
    return true;
  }
  if (['false', '0', 'no', 'n'].includes(normalized)) {
    return false;
  }

  throw new Error(`Invalid boolean value: ${value}`);
}

function parseInteger(value: string | undefined, fallback: number, name: string): number {
  if (value === undefined || value.trim() === '') {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for --${name}: ${value}`);
  }

  return parsed;
}

function parseOptionalInteger(value: string | undefined, name: string): number | null {
  if (value === undefined || value.trim() === '') {
    return null;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid integer for --${name}: ${value}`);
  }

  return parsed;
}

function hasText(value: string): boolean {
  return value.trim().length > 0;
}

async function callChrome<T>(chrome: ChromeClient, method: string, ...args: unknown[]): Promise<T> {
  return (await chrome.call(method, ...args)) as T;
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolvePromise) => setTimeout(resolvePromise, ms));
}

function renderMarkdown(result: SearchRunResult): string {
  const lines: string[] = [];

  lines.push('# Google Search Results', '');
  lines.push(`Tab ID: ${result.tabId}`);
  lines.push(`Mode: ${result.mode}`);
  lines.push(`Search summary: ${escapeMarkdown(result.searchSummary)}`);
  lines.push(`Requested: ${result.requested}`);
  lines.push(`Returned: ${result.returned}`);
  lines.push(`Pages visited: ${result.pagesVisited}`);
  lines.push(`Start offset: ${result.start}`);
  lines.push(`Include sponsored: ${result.includeSponsored ? 'yes' : 'no'}`);
  lines.push(`Final URL: <${result.activeUrl}>`);
  if (result.jsonOutputPath) {
    lines.push(`JSON output: \`${result.jsonOutputPath}\``);
  }
  lines.push('');

  if (result.pages.length > 0) {
    lines.push('## Pages', '');
    for (const page of result.pages) {
      lines.push(
        `- Page ${page.pageNumber}: <${page.url}> (${page.returned} results, start=${page.start})`
      );
    }
    lines.push('');
  }

  if (result.results.length === 0) {
    lines.push('No search results were extracted.');
    return lines.join('\n');
  }

  lines.push('## Results', '');
  for (const item of result.results) {
    lines.push(`### ${item.globalRank}. ${escapeMarkdown(item.title)}`);
    lines.push(`URL: <${item.url}>`);
    if (item.source) {
      lines.push(`Source: ${escapeMarkdown(item.source)}`);
    }
    if (item.date) {
      lines.push(`Date: ${escapeMarkdown(item.date)}`);
    }
    lines.push(`Type: ${item.kind}`);
    lines.push(`Page: ${item.pageNumber} (rank ${item.rankOnPage})`);
    lines.push(`Description: ${escapeMarkdown(item.description || 'No description available.')}`);
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

function escapeMarkdown(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\*/g, '\\*')
    .replace(/_/g, '\\_')
    .replace(/\[/g, '\\[')
    .replace(/\]/g, '\\]')
    .replace(/\r?\n+/g, ' ')
    .trim();
}

function buildHelpText(): string {
  return [
    'Google getSearch',
    '',
    'Run from the artifact root:',
    '  node .max/skills/browser-use/sites/google/scripts/get-search.mjs --query "openai agents"',
    '',
    'Core options:',
    '  --query <text>',
    '  --all-words <text>',
    '  --exact-phrase <text>',
    '  --any-words <text>',
    '  --none-words <text>',
    '  --tab-id <number>',
    '  --limit <number>',
    '  --start <number>',
    '  --include-sponsored <true|false>',
    '  --exclude-sponsored',
    '  --json-output <path>',
    '  --timeout-ms <number>',
    '',
    'Advanced filters:',
    '  --site-or-domain <value>',
    '  --file-type <value>',
    '  --language <value>',
    '  --region <value>',
    '  --terms-appearing <value>',
    '  --numbers-from <value>',
    '  --numbers-to <value>',
    '  --time-relative <d|w|m|y>',
  ].join('\n');
}

function log(message: string): void {
  process.stderr.write(`${LOG_PREFIX} ${message}\n`);
}

function stringifyError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

main().catch((error) => {
  process.stderr.write(`${LOG_PREFIX} ${stringifyError(error)}\n`);
  process.exit(1);
});
