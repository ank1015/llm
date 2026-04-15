#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { setTimeout as delay } from 'node:timers/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(scriptDirectory, '..');
const cliEntry = resolve(packageRoot, 'dist/cli.js');
const host = '127.0.0.1';
const port = '3211';
const apiUrl = `http://${host}:${port}/health`;
const webUrl = `http://${host}:${port}`;

const child = spawn(process.execPath, [
  cliEntry,
  '--host',
  host,
  '--port',
  port,
  '--no-open',
], {
  env: process.env,
  stdio: 'inherit',
});

async function waitForOk(url, label) {
  const deadline = Date.now() + 30_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return;
      }

      lastError = new Error(`${label} returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }

    await delay(500);
  }

  throw lastError instanceof Error ? lastError : new Error(`${label} did not become ready`);
}

try {
  await Promise.all([waitForOk(apiUrl, 'API'), waitForOk(webUrl, 'web app')]);
  console.log('Smoke test passed.');
} finally {
  child.kill('SIGTERM');
}
