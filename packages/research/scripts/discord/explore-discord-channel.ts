/* eslint-disable no-console */
/**
 * Exploration script: Discord channel messages DOM structure
 *
 * Run: npx tsx scripts/discord/explore-discord-channel.ts [channelUrl]
 *
 * Examples:
 *   npx tsx scripts/discord/explore-discord-channel.ts https://discord.com/channels/1456806362351669492/1456806363517943821
 */
import { connect } from '@ank1015/llm-extension';

type EvalResult = { result: unknown };

async function evaluate(
  chrome: Awaited<ReturnType<typeof connect>>,
  tabId: number,
  code: string
): Promise<unknown> {
  const res = (await chrome.call('debugger.evaluate', { tabId, code })) as EvalResult;
  return res.result;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---- Phase 1: Discover page structure ----

const DISCOVER_STRUCTURE_JS = `(() => {
  // Roles and aria-labels
  const roles = new Map();
  document.querySelectorAll('[role]').forEach(el => {
    const role = el.getAttribute('role');
    if (!roles.has(role)) roles.set(role, []);
    const info = {
      tag: el.tagName.toLowerCase(),
      className: el.className?.toString()?.substring(0, 80) || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      id: el.id || '',
      childCount: el.children.length,
    };
    if (roles.get(role).length < 3) roles.get(role).push(info);
  });

  // data-list-id and other data attributes
  const dataAttrs = new Map();
  document.querySelectorAll('*').forEach(el => {
    for (const attr of el.attributes) {
      if (attr.name.startsWith('data-') && attr.name !== 'data-reactroot') {
        if (!dataAttrs.has(attr.name)) dataAttrs.set(attr.name, []);
        if (dataAttrs.get(attr.name).length < 3) {
          dataAttrs.get(attr.name).push({
            tag: el.tagName.toLowerCase(),
            value: attr.value?.substring(0, 100) || '',
            className: el.className?.toString()?.substring(0, 60) || '',
          });
        }
      }
    }
  });

  // Look for message-like elements
  const listItems = document.querySelectorAll('[class*="message"]');
  const chatMessages = document.querySelectorAll('[id^="chat-messages-"]');
  const messageGroups = document.querySelectorAll('[class*="groupStart"]');
  const scrollers = document.querySelectorAll('[class*="scroller"]');

  return {
    url: location.href,
    title: document.title,
    roles: Object.fromEntries(roles),
    dataAttributes: Object.fromEntries(dataAttrs),
    messageClassCount: listItems.length,
    chatMessageIdCount: chatMessages.length,
    groupStartCount: messageGroups.length,
    scrollerCount: scrollers.length,
    scrollerInfo: Array.from(scrollers).map(s => ({
      tag: s.tagName.toLowerCase(),
      className: s.className?.toString()?.substring(0, 120) || '',
      role: s.getAttribute('role') || '',
      ariaLabel: s.getAttribute('aria-label') || '',
      childCount: s.children.length,
      scrollHeight: s.scrollHeight,
      clientHeight: s.clientHeight,
      scrollTop: s.scrollTop,
    })),
  };
})()`;

// ---- Phase 2: Find the message container and inspect messages ----

const INSPECT_MESSAGES_JS = `(() => {
  const chatMsgs = document.querySelectorAll('[id^="chat-messages-"]');
  if (chatMsgs.length === 0) {
    return { error: 'No chat-messages- elements found', count: 0 };
  }

  const details = Array.from(chatMsgs).slice(0, 8).map((msg, idx) => {
    const attrs = {};
    for (const attr of msg.attributes) {
      attrs[attr.name] = attr.value?.substring(0, 200) || '';
    }

    const classList = Array.from(msg.classList || []);

    const childTags = Array.from(msg.children).slice(0, 10).map(c => ({
      tag: c.tagName.toLowerCase(),
      className: c.className?.toString()?.substring(0, 100) || '',
      role: c.getAttribute('role') || '',
      childCount: c.children.length,
      textPreview: c.textContent?.trim()?.substring(0, 100) || '',
    }));

    const imgs = msg.querySelectorAll('img');
    const links = msg.querySelectorAll('a');
    const timestamps = msg.querySelectorAll('time');

    const fullText = msg.textContent?.trim()?.substring(0, 300) || '';

    return {
      index: idx,
      id: msg.id,
      attrs,
      classList,
      childTags,
      imgCount: imgs.length,
      linkCount: links.length,
      timestampCount: timestamps.length,
      timestampInfo: Array.from(timestamps).map(t => ({
        datetime: t.getAttribute('datetime') || '',
        text: t.textContent || '',
        ariaLabel: t.getAttribute('aria-label') || '',
      })),
      fullText,
    };
  });

  return {
    totalCount: chatMsgs.length,
    details,
  };
})()`;

// ---- Phase 3: Deep inspect a single message element ----

const DEEP_INSPECT_MESSAGE_JS = `(() => {
  const msg = document.querySelector('[id^="chat-messages-"]');
  if (!msg) return { error: 'No message found' };

  function mapTree(el, depth = 0, maxDepth = 5) {
    if (depth > maxDepth) return '...';
    const result = {
      tag: el.tagName?.toLowerCase() || '#text',
      id: el.id || undefined,
      role: el.getAttribute?.('role') || undefined,
      ariaLabel: el.getAttribute?.('aria-label')?.substring(0, 100) || undefined,
      className: el.className?.toString()?.substring(0, 80) || undefined,
      text: (!el.children || el.children.length === 0) ? el.textContent?.trim()?.substring(0, 100) : undefined,
      src: el.getAttribute?.('src')?.substring(0, 100) || undefined,
      href: el.getAttribute?.('href')?.substring(0, 100) || undefined,
      datetime: el.getAttribute?.('datetime') || undefined,
      dataText: el.getAttribute?.('data-text') || undefined,
    };
    Object.keys(result).forEach(k => result[k] === undefined && delete result[k]);
    if (el.children && el.children.length > 0) {
      result.children = Array.from(el.children).slice(0, 15).map(c => mapTree(c, depth + 1, maxDepth));
    }
    return result;
  }

  return mapTree(msg);
})()`;

// ---- Phase 4: Find the CORRECT scroll container ----

const FIND_SCROLLER_JS = `(() => {
  // The actual scroller is the div with role="group" that wraps the OL
  // It has class scroller__36d07 and is the parent of scrollerContent__36d07
  const allScrollable = [];
  document.querySelectorAll('div').forEach(el => {
    const st = el.scrollHeight - el.clientHeight;
    if (st > 100) {
      allScrollable.push({
        tag: el.tagName.toLowerCase(),
        className: el.className?.toString()?.substring(0, 120) || '',
        role: el.getAttribute('role') || '',
        ariaLabel: el.getAttribute('aria-label') || '',
        scrollHeight: el.scrollHeight,
        clientHeight: el.clientHeight,
        scrollTop: Math.round(el.scrollTop),
        scrollMax: st,
        id: el.id || '',
        dataListId: el.getAttribute('data-list-id') || '',
        // Check if it contains the messages OL
        containsMessageList: !!el.querySelector('[data-list-id="chat-messages"]'),
      });
    }
  });

  return {
    scrollableCount: allScrollable.length,
    elements: allScrollable,
  };
})()`;

// ---- Phase 5: Scroll UP the correct container ----

const SCROLL_UP_TEST_JS = `(() => {
  // Find the scrollable parent of the message list
  const messageList = document.querySelector('[data-list-id="chat-messages"]');
  if (!messageList) return { error: 'No message list found' };

  // Walk up to find the actual scrollable container
  let scroller = messageList.parentElement;
  while (scroller) {
    if (scroller.scrollHeight > scroller.clientHeight + 50) break;
    scroller = scroller.parentElement;
  }
  if (!scroller) return { error: 'No scrollable parent found' };

  const beforeScrollTop = Math.round(scroller.scrollTop);
  const beforeMsgCount = document.querySelectorAll('[id^="chat-messages-"]').length;
  const firstMsgId = document.querySelector('[id^="chat-messages-"]')?.id || '';

  // Scroll UP to load older messages
  scroller.scrollTop = Math.max(0, scroller.scrollTop - 1500);

  return {
    scrollerClass: scroller.className?.substring(0, 100) || '',
    scrollerRole: scroller.getAttribute('role') || '',
    beforeScrollTop,
    newScrollTop: Math.round(scroller.scrollTop),
    scrollHeight: scroller.scrollHeight,
    clientHeight: scroller.clientHeight,
    beforeMsgCount,
    firstMsgId,
  };
})()`;

const CHECK_AFTER_SCROLL_JS = `(() => {
  const messageList = document.querySelector('[data-list-id="chat-messages"]');
  if (!messageList) return { error: 'No message list found' };

  let scroller = messageList.parentElement;
  while (scroller) {
    if (scroller.scrollHeight > scroller.clientHeight + 50) break;
    scroller = scroller.parentElement;
  }
  if (!scroller) return { error: 'No scrollable parent found' };

  const msgs = document.querySelectorAll('[id^="chat-messages-"]');
  return {
    afterScrollTop: Math.round(scroller.scrollTop),
    scrollHeight: scroller.scrollHeight,
    clientHeight: scroller.clientHeight,
    afterMsgCount: msgs.length,
    firstMsgId: msgs[0]?.id || '',
    lastMsgId: msgs[msgs.length - 1]?.id || '',
  };
})()`;

// ---- Phase 6: Improved message extraction with author propagation ----

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
    // Use data-text attribute which has the clean username
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

    // Message content — specifically the message-content div, not reply content
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
      src: img.getAttribute('src')?.substring(0, 200) || '',
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
      avatarUrl: currentAvatarUrl?.substring(0, 150) || '',
      isGroupStart,
      timestamp,
      timeText,
      text: text?.substring(0, 500) || '',
      links,
      emojis,
      replyInfo,
      embedCount,
      attachments,
      reactions,
    };
  });
})()`;

async function main(): Promise<void> {
  const url =
    process.argv[2] || 'https://discord.com/channels/1456806362351669492/1456806363517943821';

  const chrome = await connect({ launch: true });

  console.log(`--- Opening: ${url} ---`);
  const tab = (await chrome.call('tabs.create', { url, active: true })) as { id: number };
  const tabId = tab.id;
  console.log('Waiting for page to load...');
  await sleep(7000);

  // Phase 1
  console.log('\n=== PHASE 1: Page Structure ===');
  const structure = await evaluate(chrome, tabId, DISCOVER_STRUCTURE_JS);
  console.log(JSON.stringify(structure, null, 2));

  // Phase 2
  console.log('\n=== PHASE 2: Message Elements ===');
  const messages = await evaluate(chrome, tabId, INSPECT_MESSAGES_JS);
  console.log(JSON.stringify(messages, null, 2));

  // Phase 3
  console.log('\n=== PHASE 3: Deep Message Inspect ===');
  const deepMsg = await evaluate(chrome, tabId, DEEP_INSPECT_MESSAGE_JS);
  console.log(JSON.stringify(deepMsg, null, 2));

  // Phase 4: Find the correct scroll container
  console.log('\n=== PHASE 4: Find Scrollable Containers ===');
  const scrollInfo = await evaluate(chrome, tabId, FIND_SCROLLER_JS);
  console.log(JSON.stringify(scrollInfo, null, 2));

  // Phase 5: Scroll up test with correct container
  console.log('\n=== PHASE 5: Scroll UP Test (3 scrolls) ===');
  for (let i = 0; i < 3; i++) {
    const before = await evaluate(chrome, tabId, SCROLL_UP_TEST_JS);
    console.log(`  Scroll #${i + 1} BEFORE:`, JSON.stringify(before));
    await sleep(3000); // longer wait for Discord to load older messages
    const after = await evaluate(chrome, tabId, CHECK_AFTER_SCROLL_JS);
    console.log(`  Scroll #${i + 1} AFTER:`, JSON.stringify(after));
  }

  // Phase 6: Extract messages with author propagation
  console.log('\n=== PHASE 6: Extract Messages (with author propagation) ===');
  const extracted = await evaluate(chrome, tabId, EXTRACT_MESSAGES_JS);
  const msgArr = extracted as Array<Record<string, unknown>>;
  console.log(`Total messages extracted: ${msgArr?.length || 0}`);
  console.log(JSON.stringify(msgArr, null, 2));
}

main().catch(console.error);
