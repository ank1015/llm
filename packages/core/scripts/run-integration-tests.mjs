#!/usr/bin/env node
/* global console, process */

import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageRoot = path.resolve(__dirname, '..');
const codexAuthPath = path.join(process.env.HOME || '', '.codex', 'auth.json');
const imageFixturePath = path.join(packageRoot, 'tests', 'utils', 'test.jpg');
const pdfFixturePath = path.join(packageRoot, 'tests', 'utils', 'research-paper.pdf');

function hasEnv(...names) {
  return names.every((name) => Boolean(process.env[name]));
}

function hasCodexAuth() {
  if (!fs.existsSync(codexAuthPath)) {
    return false;
  }

  try {
    const auth = JSON.parse(fs.readFileSync(codexAuthPath, 'utf-8'));
    return Boolean(auth?.tokens?.access_token && auth?.tokens?.account_id);
  } catch {
    return false;
  }
}

function runVitest(file) {
  return spawnSync('pnpm', ['exec', 'vitest', 'run', file], {
    cwd: packageRoot,
    stdio: 'inherit',
    env: process.env,
  }).status;
}

const suites = [
  {
    label: 'Agent runner',
    file: 'tests/integration/agent/runner.test.ts',
    enabled: hasEnv('ANTHROPIC_API_KEY'),
  },
  {
    label: 'Anthropic complete',
    file: 'tests/integration/anthropic/complete.test.ts',
    enabled: hasEnv('ANTHROPIC_API_KEY'),
  },
  {
    label: 'Anthropic file input',
    file: 'tests/integration/anthropic/file.test.ts',
    enabled: hasEnv('ANTHROPIC_API_KEY') && fs.existsSync(pdfFixturePath),
  },
  {
    label: 'Anthropic stream',
    file: 'tests/integration/anthropic/stream.test.ts',
    enabled: hasEnv('ANTHROPIC_API_KEY'),
  },
  {
    label: 'Claude Code complete',
    file: 'tests/integration/claude-code/complete.test.ts',
    enabled: hasEnv(
      'CLAUDE_CODE_OAUTH_TOKEN',
      'CLAUDE_CODE_BETA_FLAG',
      'CLAUDE_CODE_BILLING_HEADER'
    ),
  },
  {
    label: 'Claude Code file input',
    file: 'tests/integration/claude-code/file.test.ts',
    enabled:
      hasEnv('CLAUDE_CODE_OAUTH_TOKEN', 'CLAUDE_CODE_BETA_FLAG', 'CLAUDE_CODE_BILLING_HEADER') &&
      fs.existsSync(pdfFixturePath),
  },
  {
    label: 'Claude Code stream',
    file: 'tests/integration/claude-code/stream.test.ts',
    enabled: hasEnv(
      'CLAUDE_CODE_OAUTH_TOKEN',
      'CLAUDE_CODE_BETA_FLAG',
      'CLAUDE_CODE_BILLING_HEADER'
    ),
  },
  {
    label: 'Codex complete',
    file: 'tests/integration/codex/complete.test.ts',
    enabled: hasCodexAuth(),
  },
  {
    label: 'Codex file input',
    file: 'tests/integration/codex/file.test.ts',
    enabled: hasCodexAuth() && fs.existsSync(pdfFixturePath),
  },
  {
    label: 'Codex stream',
    file: 'tests/integration/codex/stream.test.ts',
    enabled: hasCodexAuth(),
  },
  {
    label: 'Cerebras complete',
    file: 'tests/integration/cerebras/complete.test.ts',
    enabled: hasEnv('CEREBRAS_API_KEY'),
  },
  {
    label: 'Cerebras stream',
    file: 'tests/integration/cerebras/stream.test.ts',
    enabled: hasEnv('CEREBRAS_API_KEY'),
  },
  {
    label: 'DeepSeek complete',
    file: 'tests/integration/deepseek/complete.test.ts',
    enabled: hasEnv('DEEPSEEK_API_KEY'),
  },
  {
    label: 'DeepSeek stream',
    file: 'tests/integration/deepseek/stream.test.ts',
    enabled: hasEnv('DEEPSEEK_API_KEY'),
  },
  {
    label: 'Google complete',
    file: 'tests/integration/google/complete.test.ts',
    enabled: hasEnv('GEMINI_API_KEY'),
  },
  {
    label: 'Google file input',
    file: 'tests/integration/google/file.test.ts',
    enabled: hasEnv('GEMINI_API_KEY') && fs.existsSync(pdfFixturePath),
  },
  {
    label: 'Google image generation',
    file: 'tests/integration/google/image-generation.test.ts',
    enabled: hasEnv('GEMINI_API_KEY') && fs.existsSync(imageFixturePath),
  },
  {
    label: 'Google stream',
    file: 'tests/integration/google/stream.test.ts',
    enabled: hasEnv('GEMINI_API_KEY'),
  },
  {
    label: 'Kimi complete',
    file: 'tests/integration/kimi/complete.test.ts',
    enabled: hasEnv('KIMI_API_KEY'),
  },
  {
    label: 'Kimi stream',
    file: 'tests/integration/kimi/stream.test.ts',
    enabled: hasEnv('KIMI_API_KEY'),
  },
  {
    label: 'MiniMax complete',
    file: 'tests/integration/minimax/complete.test.ts',
    enabled: hasEnv('MINIMAX_API_KEY'),
  },
  {
    label: 'MiniMax stream',
    file: 'tests/integration/minimax/stream.test.ts',
    enabled: hasEnv('MINIMAX_API_KEY'),
  },
  {
    label: 'OpenAI complete',
    file: 'tests/integration/openai/complete.test.ts',
    enabled: hasEnv('OPENAI_API_KEY'),
  },
  {
    label: 'OpenAI file input',
    file: 'tests/integration/openai/file.test.ts',
    enabled: hasEnv('OPENAI_API_KEY') && fs.existsSync(pdfFixturePath),
  },
  {
    label: 'OpenAI image generation',
    file: 'tests/integration/openai/image-generation.test.ts',
    enabled: hasEnv('OPENAI_API_KEY') && fs.existsSync(imageFixturePath),
  },
  {
    label: 'OpenAI stream',
    file: 'tests/integration/openai/stream.test.ts',
    enabled: hasEnv('OPENAI_API_KEY'),
  },
  {
    label: 'OpenRouter complete',
    file: 'tests/integration/openrouter/complete.test.ts',
    enabled: hasEnv('OPENROUTER_API_KEY'),
  },
  {
    label: 'OpenRouter stream',
    file: 'tests/integration/openrouter/stream.test.ts',
    enabled: hasEnv('OPENROUTER_API_KEY'),
  },
  {
    label: 'Z.AI complete',
    file: 'tests/integration/zai/complete.test.ts',
    enabled: hasEnv('ZAI_API_KEY'),
  },
  {
    label: 'Z.AI stream',
    file: 'tests/integration/zai/stream.test.ts',
    enabled: hasEnv('ZAI_API_KEY'),
  },
];

const eligibleSuites = suites.filter((suite) => suite.enabled);

if (eligibleSuites.length === 0) {
  console.log('No eligible integration suites found. Set provider credentials to run live tests.');
  process.exit(0);
}

console.log(`Running ${eligibleSuites.length} eligible integration suite(s) sequentially.`);

let failures = 0;

for (const suite of eligibleSuites) {
  console.log(`\n[${suite.label}] ${suite.file}`);
  const status = runVitest(suite.file);
  if (status !== 0) {
    failures += 1;
  }
}

if (failures > 0) {
  console.error(`\n${failures} integration suite(s) failed.`);
  process.exit(1);
}

console.log(`\nAll ${eligibleSuites.length} eligible integration suite(s) passed.`);
