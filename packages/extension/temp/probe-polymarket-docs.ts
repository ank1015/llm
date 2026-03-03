import { Window } from '../src/index.js';

interface ProbeResult {
  currentUrl: string;
  title: string;
  linkCount: number;
  sampleLinks: string[];
  copyCandidates: string[];
  hasFocus: boolean;
}

function normalizeUrl(raw: string, origin: string): string | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }

  if (url.origin !== origin) {
    return null;
  }

  url.hash = '';
  url.search = '';
  if (url.pathname.length > 1) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  const lowerPath = url.pathname.toLowerCase();
  if (
    /\.(png|jpe?g|gif|svg|webp|ico|css|js|mjs|map|pdf|zip|gz|woff2?|ttf|eot|mp4|webm|mp3)$/.test(
      lowerPath
    )
  ) {
    return null;
  }

  return url.toString();
}

async function main(): Promise<void> {
  const baseUrl = process.argv[2] || 'https://docs.polymarket.com/';
  const base = new URL(baseUrl);
  const origin = base.origin;

  const window = new Window();
  await window.ready;

  const opened = await window.open(baseUrl, {
    newTab: true,
    active: true,
    timeoutMs: 60_000,
  });

  if (typeof opened.id !== 'number') {
    throw new Error('Failed to open probe tab');
  }

  const tabId = opened.id;
  const raw = (await window.evaluate(
    `
(() => {
  const hrefs = Array.from(document.querySelectorAll('a[href]'))
    .map((a) => a.href)
    .filter((href) => typeof href === 'string' && href.length > 0);

  const candidateText = ['copy', 'copy page', 'copy markdown', 'markdown', 'md'];
  const copyCandidates = Array.from(document.querySelectorAll('button, a, [role="button"]'))
    .map((node) => {
      const text = (node.textContent || '').replace(/\\s+/g, ' ').trim();
      return text;
    })
    .filter((text) => {
      const lower = text.toLowerCase();
      return candidateText.some((token) => lower.includes(token));
    });

  return {
    currentUrl: location.href,
    title: document.title,
    hrefs,
    copyCandidates,
    hasFocus: document.hasFocus(),
  };
})()
    `.trim(),
    { tabId, timeoutMs: 60_000 }
  )) as {
    currentUrl: string;
    title: string;
    hrefs: string[];
    copyCandidates: string[];
    hasFocus: boolean;
  };

  const dedup = new Set<string>();
  for (const href of raw.hrefs) {
    const normalized = normalizeUrl(href, origin);
    if (normalized) {
      dedup.add(normalized);
    }
  }

  const result: ProbeResult = {
    currentUrl: raw.currentUrl,
    title: raw.title,
    linkCount: dedup.size,
    sampleLinks: Array.from(dedup).slice(0, 80),
    copyCandidates: raw.copyCandidates.slice(0, 40),
    hasFocus: raw.hasFocus,
  };

  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.stack : String(error)}\n`);
  process.exit(1);
});
