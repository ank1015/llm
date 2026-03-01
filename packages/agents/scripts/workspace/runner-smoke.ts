#!/usr/bin/env -S node --enable-source-maps

import { connect } from '@ank1015/llm-extension';

const now = new Date().toISOString();
const cwd = process.cwd();
const args = process.argv.slice(2);
const chrome = await connect({ launch: true });
const tabs = await chrome.call('tabs.query', { active: true, currentWindow: true });
console.log(tabs);

console.log('[runner-smoke] ok');
console.log(`[runner-smoke] now=${now}`);
console.log(`[runner-smoke] cwd=${cwd}`);
console.log(`[runner-smoke] args=${JSON.stringify(args)}`);
