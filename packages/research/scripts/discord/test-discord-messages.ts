/**
 * Test script: run createDiscordSource().getMessages() against a real browser.
 *
 * Run: npx tsx scripts/discord/test-discord-messages.ts [channelUrl] [count] [sinceHours]
 *
 * Examples:
 *   npx tsx scripts/discord/test-discord-messages.ts https://discord.com/channels/1456806362351669492/1456806363517943821
 *   npx tsx scripts/discord/test-discord-messages.ts https://discord.com/channels/1456806362351669492/1456806363517943821 30
 *   npx tsx scripts/discord/test-discord-messages.ts https://discord.com/channels/1456806362351669492/1456806363517943821 100 24
 */
import { connect } from '@ank1015/llm-extension';

import { createDiscordSource } from '../../src/sources/discord/index.js';

function formatMessage(m: {
  timeText: string;
  author: string;
  replyInfo: { author: string } | null;
  text: string;
  links: unknown[];
  attachments: unknown[];
  embedCount: number;
  reactions: Array<{ emoji: string; count: string }>;
  emojis: Array<{ alt: string }>;
  messageId: string;
  timestamp: string;
}): string {
  const text = m.text.length > 120 ? m.text.substring(0, 120) + '...' : m.text;
  const reply = m.replyInfo ? ` (reply to ${m.replyInfo.author})` : '';
  const extras: string[] = [];
  if (m.links.length > 0) extras.push(`${m.links.length} links`);
  if (m.attachments.length > 0) extras.push(`${m.attachments.length} attachments`);
  if (m.embedCount > 0) extras.push(`${m.embedCount} embeds`);
  if (m.reactions.length > 0) extras.push(m.reactions.map((r) => `${r.emoji}${r.count}`).join(' '));
  if (m.emojis.length > 0) extras.push(`emojis: ${m.emojis.map((e) => e.alt).join('')}`);

  const lines = [`  [${m.timeText}] ${m.author}${reply}`, `     ${text || '(no text)'}`];
  if (extras.length > 0) lines.push(`     [${extras.join(' | ')}]`);
  lines.push(`     id:${m.messageId} ts:${m.timestamp}\n`);
  return lines.join('\n');
}

// eslint-disable-next-line no-console
const log = console.log.bind(console);

async function main(): Promise<void> {
  const chrome = await connect({ launch: true });
  const discord = createDiscordSource({ chrome });

  const url =
    process.argv[2] || 'https://discord.com/channels/1456806362351669492/1456806363517943821';
  const count = process.argv[3] ? parseInt(process.argv[3], 10) : 30;
  const sinceHours = process.argv[4] ? parseInt(process.argv[4], 10) : undefined;

  log(`Channel: ${url}`);
  log(`Requesting: ${count} messages${sinceHours ? ` from last ${sinceHours}h` : ''}\n`);

  const messages = await discord.getMessages({ url, count, sinceHours });
  log(`\nCollected ${messages.length} messages (chronological order):\n`);

  for (let i = 0; i < messages.length; i++) {
    log(`  ${i + 1}. ${formatMessage(messages[i]!)}`);
  }
}

main().catch(console.error);  
