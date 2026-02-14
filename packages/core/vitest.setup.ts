/**
 * Vitest setup file
 *
 * Imports all provider index files to trigger self-registration
 * in the provider registry before any test runs.
 */
import './src/providers/anthropic/index.js';
import './src/providers/claude-code/index.js';
import './src/providers/codex/index.js';
import './src/providers/openai/index.js';
import './src/providers/google/index.js';
import './src/providers/deepseek/index.js';
import './src/providers/kimi/index.js';
import './src/providers/zai/index.js';
import './src/providers/minimax/index.js';
import './src/providers/cerebras/index.js';
import './src/providers/openrouter/index.js';
