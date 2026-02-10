import type { DiscordMessage } from './discord.types.js';
import type { ChromeClient } from '@ank1015/llm-extension';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type EvalResult = { result: unknown };

async function evaluate(chrome: ChromeClient, tabId: number, code: string): Promise<unknown> {
  const res = (await chrome.call('debugger.evaluate', {
    tabId,
    code,
  })) as EvalResult;
  return res.result;
}

/** Random integer in [min, max] inclusive */
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** Sleep for a randomised duration within a range (ms) */
function humanDelay(minMs: number, maxMs: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, randInt(minMs, maxMs)));
}

// ---------------------------------------------------------------------------
// Browser-side JS snippets (run inside the page via debugger.evaluate)
// ---------------------------------------------------------------------------

/**
 * Find the scrollable container that holds the message list.
 * Discord's scroller is the ancestor div with role="group" that has
 * overflow and contains the OL with data-list-id="chat-messages".
 */
const FIND_SCROLLER_JS = `(() => {
  const messageList = document.querySelector('[data-list-id="chat-messages"]');
  if (!messageList) return null;
  let scroller = messageList.parentElement;
  while (scroller) {
    if (scroller.scrollHeight > scroller.clientHeight + 50) return true;
    scroller = scroller.parentElement;
  }
  return false;
})()`;

/**
 * Scroll the message container to the very bottom so we start from
 * the newest messages. Returns scroll position info.
 */
const SCROLL_TO_BOTTOM_JS = `(() => {
  const messageList = document.querySelector('[data-list-id="chat-messages"]');
  if (!messageList) return { error: 'No message list' };
  let scroller = messageList.parentElement;
  while (scroller) {
    if (scroller.scrollHeight > scroller.clientHeight + 50) break;
    scroller = scroller.parentElement;
  }
  if (!scroller) return { error: 'No scroller' };
  scroller.scrollTop = scroller.scrollHeight;
  return {
    scrollTop: Math.round(scroller.scrollTop),
    scrollHeight: scroller.scrollHeight,
    clientHeight: scroller.clientHeight,
  };
})()`;

/**
 * Scroll the message container UP by a given amount to load older messages.
 * Returns before/after state.
 */
function scrollUpJs(pixels: number): string {
  return `(() => {
    const messageList = document.querySelector('[data-list-id="chat-messages"]');
    if (!messageList) return { error: 'No message list' };
    let scroller = messageList.parentElement;
    while (scroller) {
      if (scroller.scrollHeight > scroller.clientHeight + 50) break;
      scroller = scroller.parentElement;
    }
    if (!scroller) return { error: 'No scroller' };
    const beforeScrollTop = Math.round(scroller.scrollTop);
    const beforeHeight = scroller.scrollHeight;
    scroller.scrollTop = Math.max(0, scroller.scrollTop - ${pixels});
    return {
      beforeScrollTop,
      afterScrollTop: Math.round(scroller.scrollTop),
      beforeHeight,
      afterHeight: scroller.scrollHeight,
      msgCount: document.querySelectorAll('[id^="chat-messages-"]').length,
    };
  })()`;
}

/**
 * Extract structured data from every message currently in the DOM.
 * Handles author propagation: continuation messages inherit the author
 * from the preceding group-start message.
 */
const EXTRACT_MESSAGES_JS = `(() => {
  const msgs = document.querySelectorAll('[id^="chat-messages-"]');
  let currentAuthor = '';
  let currentAvatarUrl = '';

  return Array.from(msgs).map(msg => {
    const domId = msg.id;
    const idParts = domId.split('-');
    const messageId = idParts[idParts.length - 1] || '';

    const article = msg.querySelector('[role="article"]');
    const isGroupStart = article?.className?.includes('groupStart') || false;

    // Author: only on group starts, inside contents > header > headerText > username
    // data-text attribute has the clean username
    if (isGroupStart) {
      const contentsEl = article?.querySelector('[class*="contents_"]');
      const headerEl = contentsEl?.querySelector('[class*="header_"] [class*="headerText_"]');
      const usernameEl = headerEl?.querySelector('[class*="username_"]');
      const dataText = usernameEl?.getAttribute('data-text') || '';
      currentAuthor = dataText || usernameEl?.textContent?.trim() || '';

      const avatarImg = contentsEl?.querySelector('img[class*="avatar_"]');
      currentAvatarUrl = avatarImg?.getAttribute('src') || '';
    }

    // Timestamp
    const timeEl = msg.querySelector('time');
    const timestamp = timeEl?.getAttribute('datetime') || '';
    const timeText = timeEl?.textContent?.trim() || '';

    // Message content — specifically the message-content div for THIS message
    const contentEl = msg.querySelector('[id^="message-content-' + messageId + '"]');
    const text = contentEl?.textContent?.trim() || '';

    // Links inside message content
    const links = contentEl
      ? Array.from(contentEl.querySelectorAll('a')).map(a => ({
          text: a.textContent || '',
          href: a.getAttribute('href') || '',
        }))
      : [];

    // Emojis
    const emojis = contentEl
      ? Array.from(contentEl.querySelectorAll('img[data-type="emoji"]')).map(e => ({
          name: e.getAttribute('data-name') || '',
          alt: e.getAttribute('alt') || '',
        }))
      : [];

    // Reply info
    const replyEl = msg.querySelector('[class*="repliedMessage_"]');
    let replyInfo = null;
    if (replyEl) {
      const replyAuthorEl = replyEl.querySelector('[class*="username_"]');
      const replyContentEl = replyEl.querySelector('[class*="repliedTextContent_"]');
      const replyContentId = replyContentEl?.id || '';
      const replyMsgId = replyContentId.replace('message-content-', '') || '';
      replyInfo = {
        author: replyAuthorEl?.textContent?.trim()?.replace(/^@/, '') || '',
        text: replyContentEl?.textContent?.trim()?.substring(0, 200) || '',
        replyToMessageId: replyMsgId,
      };
    }

    // Embeds
    const accessoriesEl = msg.querySelector('[id^="message-accessories-"]');
    const embedEls = accessoriesEl?.querySelectorAll('[class*="embed"]') || [];
    const embedCount = embedEls.length;

    // Attachment images
    const attachmentImgs = accessoriesEl?.querySelectorAll('[class*="imageWrapper"] img') || [];
    const attachments = Array.from(attachmentImgs).map(img => ({
      src: img.getAttribute('src')?.substring(0, 300) || '',
      alt: img.getAttribute('alt') || '',
    }));

    // Reactions
    const reactionEls = msg.querySelectorAll('[class*="reaction_"]');
    const reactions = Array.from(reactionEls).slice(0, 20).map(r => {
      const emojiImg = r.querySelector('img[data-type="emoji"]');
      const countEl = r.querySelector('[class*="reactionCount"]');
      return {
        emoji: emojiImg?.getAttribute('data-name') || emojiImg?.getAttribute('alt') || r.textContent?.trim() || '',
        count: countEl?.textContent?.trim() || '1',
      };
    });

    return {
      messageId,
      author: currentAuthor,
      avatarUrl: currentAvatarUrl?.substring(0, 200) || '',
      isGroupStart,
      timestamp,
      timeText,
      text: text?.substring(0, 2000) || '',
      links,
      emojis,
      replyInfo,
      embedCount,
      attachments,
      reactions,
    };
  });
})()`;

// ---------------------------------------------------------------------------
// Scroll-and-collect loop (scrolls UP for Discord)
// ---------------------------------------------------------------------------

interface CollectMessagesOptions {
  chrome: ChromeClient;
  tabId: number;
  /** Target message count (used for count-based mode) */
  target: number;
  /** If set, stop collecting when a message older than this is seen (ISO string) */
  sinceTimestamp?: string | undefined;
  maxScrollAttempts: number;
}

interface ScrollResult {
  beforeScrollTop: number;
  afterScrollTop: number;
  beforeHeight: number;
  afterHeight: number;
  msgCount: number;
}

async function collectMessages(opts: CollectMessagesOptions): Promise<DiscordMessage[]> {
  const { chrome, tabId, target, sinceTimestamp, maxScrollAttempts } = opts;

  const seenIds = new Set<string>();
  const collected: DiscordMessage[] = [];

  function addNew(raw: Array<Record<string, unknown>>): number {
    let added = 0;
    for (const m of raw) {
      const id = String(m.messageId ?? '');
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        collected.push(m as unknown as DiscordMessage);
        added++;
      }
    }
    return added;
  }

  /** Check if we've reached messages older than sinceTimestamp */
  function hasReachedTimeLimit(): boolean {
    if (!sinceTimestamp) return false;
    // collected is in DOM order (oldest first after scroll ups)
    // Check if the oldest message is before our cutoff
    for (const m of collected) {
      if (m.timestamp && m.timestamp < sinceTimestamp) return true;
    }
    return false;
  }

  // Initial extraction
  const initial = (await evaluate(chrome, tabId, EXTRACT_MESSAGES_JS)) as Array<
    Record<string, unknown>
  >;
  addNew(initial);

  // If we already have enough or reached time limit, return early
  if (collected.length >= target || hasReachedTimeLimit()) {
    return filterAndSlice(collected, target, sinceTimestamp);
  }

  // Scroll UP loop to load older messages
  let attempts = 0;
  let staleRounds = 0;
  let recoveryAttempts = 0;
  const maxStaleRecoveries = 2;

  while (attempts < maxScrollAttempts) {
    attempts++;

    // Scroll up a large amount to trigger batch load
    const scrollPx = randInt(2000, 4000);
    const scrollResult = (await evaluate(chrome, tabId, scrollUpJs(scrollPx))) as ScrollResult;

    // Wait for Discord to load older messages
    await humanDelay(2000, 3500);

    // Occasional longer pause
    if (Math.random() < 0.1) {
      await humanDelay(1500, 3000);
    }

    // Extract all messages currently in DOM
    const batch = (await evaluate(chrome, tabId, EXTRACT_MESSAGES_JS)) as Array<
      Record<string, unknown>
    >;
    const newCount = addNew(batch);

    // Check termination conditions
    if (collected.length >= target || hasReachedTimeLimit()) break;

    if (newCount === 0) {
      staleRounds++;

      // If we hit the very top (scrollTop is 0 or didn't change), try once more
      if (scrollResult.afterScrollTop <= 0) {
        // We're at the very top of the channel history
        break;
      }

      if (staleRounds >= 3) {
        // Try scrolling to the very top to trigger a batch load
        await evaluate(
          chrome,
          tabId,
          `(() => {
          const messageList = document.querySelector('[data-list-id="chat-messages"]');
          if (!messageList) return;
          let scroller = messageList.parentElement;
          while (scroller) {
            if (scroller.scrollHeight > scroller.clientHeight + 50) break;
            scroller = scroller.parentElement;
          }
          if (scroller) scroller.scrollTop = 0;
        })()`
        );
        await humanDelay(3000, 5000);
        staleRounds = 0;
        recoveryAttempts++;

        if (recoveryAttempts >= maxStaleRecoveries) break;
      }
    } else {
      staleRounds = 0;
      recoveryAttempts = 0;
    }
  }

  return filterAndSlice(collected, target, sinceTimestamp);
}

/**
 * Filter messages by time cutoff (if any) and slice to target count.
 * Returns newest messages first (reversed from DOM order).
 */
function filterAndSlice(
  collected: DiscordMessage[],
  target: number,
  sinceTimestamp?: string
): DiscordMessage[] {
  let result = collected;

  // Filter out messages older than sinceTimestamp
  if (sinceTimestamp) {
    result = result.filter((m) => !m.timestamp || m.timestamp >= sinceTimestamp);
  }

  // Sort chronologically (oldest first — natural reading order for chat)
  result.sort((a, b) => {
    if (!a.timestamp || !b.timestamp) return 0;
    return a.timestamp.localeCompare(b.timestamp);
  });

  // Keep the N most recent messages (slice from the end)
  if (result.length > target) {
    result = result.slice(result.length - target);
  }

  return result;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface DiscordSourceOptions {
  /** ChromeClient instance connected to Chrome */
  chrome: ChromeClient;
}

export interface GetMessagesParams {
  /** Full Discord channel URL (e.g. "https://discord.com/channels/serverId/channelId") */
  url: string;
  /** Number of messages to collect (default 50) */
  count?: number;
  /**
   * Only return messages from the last N hours.
   * When set, collection stops when messages older than this are found.
   */
  sinceHours?: number;
}

export interface DiscordSource {
  /** Extract messages from a Discord channel */
  getMessages: (params: GetMessagesParams) => Promise<DiscordMessage[]>;
}

export function createDiscordSource(options: DiscordSourceOptions): DiscordSource {
  const { chrome } = options;

  async function getMessages(params: GetMessagesParams): Promise<DiscordMessage[]> {
    const { url, count = 50, sinceHours } = params;

    // Calculate timestamp cutoff for time-based filtering
    let sinceTimestamp: string | undefined;
    if (sinceHours !== undefined) {
      const cutoff = new Date(Date.now() - sinceHours * 60 * 60 * 1000);
      sinceTimestamp = cutoff.toISOString();
    }

    const tab = (await chrome.call('tabs.create', {
      url,
      active: true, // Discord needs active tab for message rendering
    })) as { id: number };
    const tabId = tab.id;

    try {
      // Wait for Discord to load the channel
      await humanDelay(5000, 7000);

      // Verify the message list exists
      const hasScroller = await evaluate(chrome, tabId, FIND_SCROLLER_JS);
      if (!hasScroller) {
        throw new Error('Discord message list not found. Page may not have loaded correctly.');
      }

      // Scroll to bottom first to ensure we start from newest messages.
      // Discord may open at the "new messages" divider (middle of history),
      // so this normalises the starting position.
      await evaluate(chrome, tabId, SCROLL_TO_BOTTOM_JS);
      await humanDelay(1500, 2500);

      // Collect messages by scrolling UP
      return await collectMessages({
        chrome,
        tabId,
        target: count,
        sinceTimestamp,
        maxScrollAttempts: Math.max(Math.ceil(count / 25), 10),
      });
    } finally {
      await chrome.call('tabs.remove', tabId).catch(() => {});
    }
  }

  return { getMessages };
}
