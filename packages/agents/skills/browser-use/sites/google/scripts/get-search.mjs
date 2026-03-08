#!/usr/bin/env node

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

function printHelp() {
  process.stdout.write(`Usage: node .max/skills/browser-use/sites/google/scripts/get-search.mjs --query "search terms" [options]

Run a Google search in a live Chrome session and extract a structured result set.

Options:
  --query <text>         Search query to run
  --limit <number>       Maximum number of results to return (default: 10)
  --json-output <path>   Optional file path for saved JSON output
  --timeout-ms <number>  Max time to wait for search results (default: 15000)
  --help                 Show this help text

Examples:
  node .max/skills/browser-use/sites/google/scripts/get-search.mjs --query "openai agents"
  node .max/skills/browser-use/sites/google/scripts/get-search.mjs --query "openai agents" --limit 20 --json-output .max/temp/browser-use/google-search.json
`);
}

function parseArgs(argv) {
  const options = {
    query: '',
    limit: 10,
    jsonOutput: '',
    timeoutMs: 15_000,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--query' || arg === '--limit' || arg === '--json-output' || arg === '--timeout-ms') {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }

      if (arg === '--query') {
        options.query = value;
      } else if (arg === '--limit') {
        const parsedLimit = Number.parseInt(value, 10);
        if (!Number.isFinite(parsedLimit) || parsedLimit < 1) {
          throw new Error('--limit must be a positive integer');
        }
        options.limit = parsedLimit;
      } else if (arg === '--json-output') {
        options.jsonOutput = value;
      } else if (arg === '--timeout-ms') {
        const parsedTimeout = Number.parseInt(value, 10);
        if (!Number.isFinite(parsedTimeout) || parsedTimeout < 1000) {
          throw new Error('--timeout-ms must be an integer >= 1000');
        }
        options.timeoutMs = parsedTimeout;
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

async function waitForResults(chrome, tabId, timeoutMs) {
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const evaluation = await chrome.call('debugger.evaluate', {
      tabId,
      awaitPromise: true,
      userGesture: true,
      code: `(() => ({
        readyState: document.readyState,
        resultCount: document.querySelectorAll('div.g, div[data-snc], a h3').length
      }))()`,
    });

    const state = evaluation?.result ?? {};
    if (state.readyState === 'complete' && state.resultCount > 0) {
      return;
    }

    await sleep(500);
  }

  throw new Error(`Timed out after ${timeoutMs}ms waiting for Google search results`);
}

function buildExtractionCode(limit) {
  return `(() => {
    const items = [];
    const containers = Array.from(document.querySelectorAll('div.g, div[data-snc]'));

    for (const container of containers) {
      if (!(container instanceof HTMLElement)) {
        continue;
      }

      const link = container.querySelector('a[href]');
      const titleNode = container.querySelector('h3');
      if (!(link instanceof HTMLAnchorElement) || !(titleNode instanceof HTMLElement)) {
        continue;
      }

      const snippetNode = container.querySelector('.VwiC3b, .yXK7lf, .s3v9rd, [data-sncf]');
      const title = titleNode.innerText.trim();
      const url = link.href;
      if (!title || !url) {
        continue;
      }

      items.push({
        title,
        url,
        snippet: snippetNode instanceof HTMLElement ? snippetNode.innerText.trim() : '',
      });

      if (items.length >= ${limit}) {
        break;
      }
    }

    return {
      query: new URLSearchParams(location.search).get('q') ?? '',
      url: location.href,
      results: items,
    };
  })()`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (!options.query) {
    throw new Error('--query is required');
  }

  const { connect } = await import('@ank1015/llm-extension');
  const chrome = await connect({ launch: true });
  let workingTabId = null;

  try {
    const searchUrl = `https://www.google.com/search?q=${encodeURIComponent(options.query)}&num=${Math.min(options.limit, 100)}`;
    const createdTab = await chrome.call('tabs.create', {
      url: searchUrl,
      active: true,
    });

    workingTabId = createdTab?.id ?? null;
    if (typeof workingTabId !== 'number') {
      throw new Error('Failed to create a working Chrome tab for the Google search');
    }

    await waitForResults(chrome, workingTabId, options.timeoutMs);

    const extraction = await chrome.call('debugger.evaluate', {
      tabId: workingTabId,
      awaitPromise: true,
      userGesture: true,
      code: buildExtractionCode(options.limit),
    });

    const payload = {
      query: options.query,
      url: extraction?.result?.url ?? searchUrl,
      resultCount: Array.isArray(extraction?.result?.results) ? extraction.result.results.length : 0,
      results: Array.isArray(extraction?.result?.results) ? extraction.result.results : [],
    };

    if (options.jsonOutput) {
      const outputPath = resolve(process.cwd(), options.jsonOutput);
      await mkdir(dirname(outputPath), { recursive: true });
      await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`, 'utf-8');
      process.stderr.write(`Saved JSON output to ${outputPath}\n`);
    }

    process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    process.exit(0);
  } finally {
    if (typeof workingTabId === 'number') {
      try {
        await chrome.call('tabs.remove', workingTabId);
      } catch {
        // Ignore cleanup errors.
      }
    }
  }
}

main().catch((error) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
