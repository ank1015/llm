import { isMainModule } from '../../../../utils/is-main-module.js';
import { withWebBrowser } from '../../web.js';

export interface FetchNMailsOptions {
  count?: number;
  launch?: boolean;
}

export interface GmailMailOverview {
  index: number;
  rowId: string | null;
  threadId: string | null;
  sender: string;
  senderEmail: string | null;
  subject: string;
  snippet: string;
  time: string;
  unread: boolean;
  selected: boolean;
  starred: boolean;
  textSnippet: string;
}

export interface FetchNMailsResult {
  status: 'ok' | 'login-required' | 'inbox-unavailable';
  page: {
    title: string;
    url: string;
    route: string;
  };
  rowSelector: string | null;
  visibleRowCount: number;
  mails: GmailMailOverview[];
}

interface FetchNMailsCliOptions extends Required<FetchNMailsOptions> {}

const DEFAULT_COUNT = 5;
const GMAIL_URL_PREFIX = 'https://mail.google.com/';
const GMAIL_INBOX_URL = 'https://mail.google.com/mail/u/0/#inbox';
const INBOX_ROW_SELECTORS = [
  'tr.zA',
  '[role="main"] tr.zA',
  '.UI table tr.zA',
  '[role="main"] [role="row"]',
];

export async function fetchNMails(options: FetchNMailsOptions = {}): Promise<FetchNMailsResult> {
  const resolvedOptions = resolveOptions(options);

  return await withWebBrowser(
    async (browser) => {
      const existingTabs = await browser.findTabs((info) =>
        typeof info.url === 'string' ? info.url.startsWith(GMAIL_URL_PREFIX) : false
      );

      const existingInboxTab = existingTabs.find((tab) =>
        tab.peekInfo().url?.startsWith(GMAIL_INBOX_URL)
      );

      const tab =
        existingInboxTab ??
        (await browser.openTab(GMAIL_INBOX_URL, {
          active: true,
        }));

      if (existingInboxTab) {
        await tab.focus();
      }

      await tab.waitForLoad();
      await tab.waitFor({ selector: 'body' });
      await tab.waitFor({
        predicate: `Boolean(
          document.querySelector('tr.zA') ||
          document.querySelector('[role="main"]') ||
          document.querySelector('input[type="email"]') ||
          document.querySelector('input[type="password"]')
        )`,
        timeoutMs: 30_000,
      });
      await tab.waitForIdle(1_500);

      return await tab.evaluate<FetchNMailsResult>(
        `(() => {
          const count = ${JSON.stringify(resolvedOptions.count)};
          const inboxRowSelectors = ${JSON.stringify(INBOX_ROW_SELECTORS)};

          const normalize = (value) => (value || '').replace(/\\s+/g, ' ').trim();
          const truncate = (value, max = 220) => {
            const text = normalize(value);
            return text.length > max ? text.slice(0, max - 1) + '…' : text;
          };

          const route = (() => {
            const hash = window.location.hash || '';
            if (hash.includes('#inbox')) return 'inbox';
            if (hash.includes('#sent')) return 'sent';
            if (hash.includes('#drafts')) return 'drafts';
            if (hash.includes('#spam')) return 'spam';
            return hash || window.location.pathname;
          })();

          const activeRowSelector =
            inboxRowSelectors.find((selector) => document.querySelector(selector)) || null;
          const rows = activeRowSelector
            ? Array.from(document.querySelectorAll(activeRowSelector))
            : [];

          const isLoginGate = Boolean(
            document.querySelector('input[type="email"]') ||
              document.querySelector('input[type="password"]') ||
              normalize(document.body?.innerText || '').includes('Sign in')
          );

          const mails = rows
            .slice(0, count)
            .map((row, index) => {
              if (!(row instanceof HTMLElement)) {
                return null;
              }

              const senderElement =
                row.querySelector('.yP') ||
                row.querySelector('.yW span[email]') ||
                row.querySelector('span[email]') ||
                row.querySelector('[email]');
              const subjectElement = row.querySelector('.bog') || row.querySelector('.y6');
              const snippetElement = row.querySelector('.y2');
              const timeElement = row.querySelector('.xW span') || row.querySelector('.xW');

              return {
                index,
                rowId: row.getAttribute('id'),
                threadId:
                  row.getAttribute('data-legacy-thread-id') ||
                  row.getAttribute('data-thread-id'),
                sender: normalize(senderElement?.textContent || ''),
                senderEmail:
                  senderElement instanceof Element
                    ? senderElement.getAttribute('email') || senderElement.getAttribute('data-hovercard-id')
                    : null,
                subject: normalize(subjectElement?.textContent || ''),
                snippet: normalize(snippetElement?.textContent || ''),
                time: normalize(timeElement?.textContent || ''),
                unread:
                  row.classList.contains('zE') ||
                  row.getAttribute('aria-label')?.includes('Unread') === true,
                selected: row.getAttribute('aria-selected') === 'true',
                starred: Boolean(
                  row.querySelector('[aria-label*="Starred"]') ||
                    row.querySelector('[aria-label*="Not starred"]') ||
                    row.querySelector('.aXw')
                ),
                textSnippet: truncate(row.innerText),
              };
            })
            .filter(Boolean);

          return {
            status: isLoginGate
              ? 'login-required'
              : rows.length > 0
                ? 'ok'
                : 'inbox-unavailable',
            page: {
              title: document.title,
              url: window.location.href,
              route,
            },
            rowSelector: activeRowSelector,
            visibleRowCount: rows.length,
            mails,
          };
        })()`,
        {
          returnByValue: true,
        }
      );
    },
    {
      launch: resolvedOptions.launch,
    }
  );
}

export function parseFetchNMailsCliArgs(argv: string[]): FetchNMailsCliOptions {
  let count = DEFAULT_COUNT;
  let launch = true;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (!arg) {
      continue;
    }

    if (arg === '--count' || arg === '-n') {
      const rawValue = argv[index + 1];
      if (!rawValue) {
        throw new Error(`Missing value for ${arg}`);
      }
      count = parsePositiveInteger(rawValue, arg);
      index += 1;
      continue;
    }

    if (arg.startsWith('--count=')) {
      count = parsePositiveInteger(arg.slice('--count='.length), '--count');
      continue;
    }

    if (arg === '--no-launch') {
      launch = false;
      continue;
    }
  }

  return { count, launch };
}

function resolveOptions(options: FetchNMailsOptions): FetchNMailsCliOptions {
  return {
    count:
      typeof options.count === 'number' && Number.isFinite(options.count) && options.count > 0
        ? Math.floor(options.count)
        : DEFAULT_COUNT,
    launch: options.launch ?? true,
  };
}

function parsePositiveInteger(value: string, flag: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`Expected a positive integer for ${flag}. Received: ${value}`);
  }

  return parsed;
}

async function runCli(): Promise<void> {
  const options = parseFetchNMailsCliArgs(process.argv.slice(2));
  const result = await fetchNMails(options);
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

if (isMainModule(import.meta.url)) {
  runCli().catch((error: unknown) => {
    const message = error instanceof Error ? (error.stack ?? error.message) : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  });
}
