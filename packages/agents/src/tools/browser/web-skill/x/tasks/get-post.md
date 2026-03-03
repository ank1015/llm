# Task: getPost

File: `/Users/notacoder/Desktop/agents/llm/packages/agents/src/tools/browser/web-skill/x/tasks/get-post.md`  
Works on URLs:

- `https://x.com/<handle>/status/<id>`

Use this snippet to extract one post from a canonical X post URL (with optional replies from the same page).

Compatibility note:

- Keep adapted code in plain JavaScript for REPL stability.
- Avoid TypeScript type annotations, optional chaining (`?.`), and nullish coalescing (`??`) in adapted variants.

```js
const POST_STATE = String.raw`(() => {
  const path = window.location.pathname;
  const loginRequired =
    path.indexOf('/i/flow/login') >= 0 ||
    document.querySelector('input[name="session[username_or_email]"]') !== null ||
    document.querySelector('input[autocomplete="username"]') !== null ||
    document.querySelector('a[href*="/i/flow/login"]') !== null ||
    document.querySelector('[data-testid="loginButton"]') !== null;

  const articleCount = document.querySelectorAll('article[data-testid="tweet"]').length;
  const statusLinkCount = document.querySelectorAll('a[href*="/status/"]').length;

  return {
    url: window.location.href,
    title: document.title,
    loginRequired,
    articleCount,
    statusLinkCount,
    hasPrimaryColumn: document.querySelector('[data-testid="primaryColumn"]') !== null,
    ready: loginRequired || articleCount > 0 || statusLinkCount > 0,
  };
})()`;

const EXTRACT_POST_PAGE = String.raw`(() => {
  const clean = (value) => String(value == null ? '' : value).replace(/\s+/g, ' ').trim();

  const parseMetric = (value) => {
    const text = clean(value).replace(/,/g, '');
    if (!text) return null;
    const match = text.match(/([0-9]*\.?[0-9]+)\s*([KMB])?/i);
    if (!match) return null;

    const number = Number(match[1]);
    if (!Number.isFinite(number)) return null;

    const unit = clean(match[2] || '').toUpperCase();
    if (unit === 'K') return Math.round(number * 1000);
    if (unit === 'M') return Math.round(number * 1000 * 1000);
    if (unit === 'B') return Math.round(number * 1000 * 1000 * 1000);
    return Math.round(number);
  };

  const getMetric = (root, testId) => {
    const node = root.querySelector('[data-testid="' + testId + '"]');
    if (!(node instanceof HTMLElement)) return null;

    const visible = clean(node.textContent || '');
    const aria = clean(node.getAttribute('aria-label') || '');
    return parseMetric(visible || aria);
  };

  const parseStatusUrl = (href) => {
    try {
      const url = new URL(href || '', window.location.href);
      const match = url.pathname.match(/^\/([^/]+)\/status\/(\d+)/);
      if (!match) return null;
      return {
        handle: match[1],
        postId: match[2],
        url: 'https://x.com/' + match[1] + '/status/' + match[2],
      };
    } catch {
      return null;
    }
  };

  const parseAuthorHandle = (container) => {
    const anchors = container.querySelectorAll('a[href^="/"]');
    for (const anchor of anchors) {
      if (!(anchor instanceof HTMLAnchorElement)) continue;
      const href = clean(anchor.getAttribute('href') || '');
      const match = href.match(/^\/([A-Za-z0-9_]{1,15})(?:$|\/)/);
      if (!match) continue;
      if (match[1].toLowerCase() === 'status') continue;
      return match[1];
    }
    return '';
  };

  const parseAuthorName = (container) => {
    const spans = container.querySelectorAll('span');
    for (const span of spans) {
      if (!(span instanceof HTMLElement)) continue;
      const text = clean(span.textContent || '');
      if (!text) continue;
      if (text.indexOf('@') === 0) continue;
      if (/^\d+[smhdwy]$/i.test(text)) continue;
      if (text.toLowerCase() === 'article') continue;
      return text;
    }
    return '';
  };

  const getDirAutoTexts = (root) => {
    const out = [];
    const seen = new Set();
    for (const node of root.querySelectorAll('div[dir="auto"], span[dir="auto"]')) {
      if (!(node instanceof HTMLElement)) continue;
      const text = clean(node.textContent || '');
      if (!text) continue;
      if (text.toLowerCase() === 'article') continue;
      if (seen.has(text)) continue;
      seen.add(text);
      out.push(text);
    }
    return out;
  };

  const cleanMultiline = (value) => {
    const lines = String(value == null ? '' : value)
      .replace(/\r/g, '')
      .split('\n')
      .map((line) => line.replace(/\s+/g, ' ').trim())
      .filter(Boolean);
    return lines.join('\n');
  };

  const extractArticleContent = (root) => {
    const richCandidates = [
      root.querySelector('[data-testid="twitterArticleRichTextView"]'),
      root.querySelector('[data-testid="longformRichTextComponent"]'),
    ];

    for (const node of richCandidates) {
      if (!(node instanceof HTMLElement)) continue;
      const text = cleanMultiline(node.innerText || node.textContent || '');
      if (text) return text;
    }

    const blocks = [];
    const seen = new Set();
    for (const block of root.querySelectorAll('.public-DraftStyleDefault-block')) {
      if (!(block instanceof HTMLElement)) continue;
      const text = cleanMultiline(block.innerText || block.textContent || '');
      if (!text || seen.has(text)) continue;
      seen.add(text);
      blocks.push(text);
      if (blocks.length >= 24) break;
    }
    if (blocks.length > 0) return blocks.join('\n');

    return '';
  };

  const extractArticleCard = (root) => {
    const toCompactHref = (value) => clean(value).replace(/\s+/g, '');
    const parseArticleHref = (href) => {
      const compact = toCompactHref(href);
      const match = compact.match(/^\/([A-Za-z0-9_]{1,15})\/article\/(\d+)(?:\/media\/\d+)?/i);
      if (!match) return '';
      return 'https://x.com/' + match[1] + '/article/' + match[2];
    };

    const pickArticleUrl = (start) => {
      let node = start;
      for (let depth = 0; depth < 6; depth++) {
        for (const link of node.querySelectorAll('a[href]')) {
          if (!(link instanceof HTMLAnchorElement)) continue;
          const href = clean(link.getAttribute('href') || '');
          if (!href) continue;

          const articleHref = parseArticleHref(href);
          if (articleHref) return articleHref;

          const compactHref = toCompactHref(href);
          if (compactHref.indexOf('/status/') >= 0) continue;
          if (compactHref.indexOf('/analytics') >= 0) continue;
          if (compactHref.indexOf('/photo/') >= 0) continue;
          try {
            return new URL(compactHref, window.location.href).href;
          } catch {
            return compactHref;
          }
        }
        if (!(node.parentElement instanceof HTMLElement)) break;
        node = node.parentElement;
      }
      return '';
    };

    const cover = root.querySelector('[data-testid="article-cover-image"]');
    let scope = cover instanceof HTMLElement ? cover : null;
    let articleUrlHint = '';

    if (!(scope instanceof HTMLElement)) {
      const badgeCandidates = Array.from(root.querySelectorAll('span, div'));
      for (const node of badgeCandidates) {
        if (!(node instanceof HTMLElement)) continue;
        const label = clean(node.textContent || '').toLowerCase();
        if (label !== 'x article' && label !== 'article') continue;
        scope = node;
        break;
      }
    }

    if (!(scope instanceof HTMLElement)) {
      for (const link of root.querySelectorAll('a[href]')) {
        if (!(link instanceof HTMLAnchorElement)) continue;
        const parsed = parseArticleHref(link.getAttribute('href') || '');
        if (!parsed) continue;
        articleUrlHint = parsed;
        scope = link;
        break;
      }
    }

    if (!(scope instanceof HTMLElement)) return null;

    let texts = [];
    for (let i = 0; i < 8; i++) {
      texts = getDirAutoTexts(scope);
      const imageCount = scope.querySelectorAll('img[src]').length;
      if (texts.length > 0 && imageCount > 0) break;
      if (!(scope.parentElement instanceof HTMLElement)) break;
      scope = scope.parentElement;
    }

    let coverImageUrl = '';
    if (cover && cover instanceof HTMLElement) {
      const coverImg = cover.querySelector('img[src]');
      coverImageUrl =
        coverImg && coverImg instanceof HTMLImageElement
          ? clean(coverImg.getAttribute('src') || '')
          : '';
    }
    if (!coverImageUrl) {
      const scopeImage = scope.querySelector('img[src]');
      coverImageUrl =
        scopeImage && scopeImage instanceof HTMLImageElement
          ? clean(scopeImage.getAttribute('src') || '')
          : '';
    }

    const articleUrl = articleUrlHint || pickArticleUrl(scope);
    const content = extractArticleContent(scope);
    const title = texts.length > 0 ? texts[0] : '';
    const descriptionFromTexts = texts.length > 1 ? texts[1] : '';
    const descriptionFromContent = content ? content.split('\n')[0] || '' : '';
    const description = descriptionFromTexts || descriptionFromContent;

    if (!title && !description && !content && !coverImageUrl) return null;

    return {
      kind: 'article',
      url: articleUrl,
      title,
      description,
      content,
      coverImageUrl,
    };
  };

  const extractMedia = (article) => {
    const media = [];

    for (const img of article.querySelectorAll('[data-testid="tweetPhoto"] img')) {
      if (!(img instanceof HTMLImageElement)) continue;
      const src = clean(img.getAttribute('src') || '');
      if (!src) continue;
      media.push({ type: 'photo', url: src });
    }

    for (const vid of article.querySelectorAll('video')) {
      if (!(vid instanceof HTMLVideoElement)) continue;
      const src = clean(vid.getAttribute('src') || '');
      if (!src) continue;
      media.push({ type: 'video', url: src });
    }

    return media;
  };

  const extractQuotedPost = (article, mainPostUrl, outerAuthorHandle) => {
    const raw = clean(article.textContent || '');
    const userNameBlocks = Array.from(article.querySelectorAll('div[data-testid="User-Name"]'));
    const hasQuoteHint =
      raw.indexOf('Quote') >= 0 ||
      article.querySelector('[role="blockquote"]') !== null ||
      userNameBlocks.length > 1;

    if (!hasQuoteHint) return null;

    const quotedNameBlock = userNameBlocks.length > 1 ? userNameBlocks[1] : null;
    let quoteRoot = article.querySelector('[role="blockquote"]');
    if (!(quoteRoot instanceof HTMLElement) && quotedNameBlock instanceof HTMLElement) {
      let node = quotedNameBlock;
      for (let i = 0; i < 10; i++) {
        const hasArticleCard = node.querySelector('[data-testid="article-cover-image"]') !== null;
        const hasTweetText = node.querySelector('[data-testid="tweetText"]') !== null;
        const dirAutoCount = node.querySelectorAll('div[dir="auto"], span[dir="auto"]').length;
        if (hasArticleCard || hasTweetText || dirAutoCount >= 2) {
          quoteRoot = node;
          break;
        }
        if (!(node.parentElement instanceof HTMLElement)) break;
        node = node.parentElement;
      }
    }
    if (!(quoteRoot instanceof HTMLElement)) {
      quoteRoot = article;
    }

    const quoteStatusCandidates = [];
    for (const link of quoteRoot.querySelectorAll('a[href*="/status/"]')) {
      if (!(link instanceof HTMLAnchorElement)) continue;
      const parsed = parseStatusUrl(link.getAttribute('href') || '');
      if (!parsed) continue;
      if (parsed.url === mainPostUrl) continue;
      if (quoteStatusCandidates.some((entry) => entry.url === parsed.url)) continue;
      quoteStatusCandidates.push(parsed);
    }
    const quoteStatus = quoteStatusCandidates.length > 0 ? quoteStatusCandidates[0] : null;

    const quoteTextParts = [];
    for (const node of quoteRoot.querySelectorAll('[data-testid="tweetText"]')) {
      if (!(node instanceof HTMLElement)) continue;
      const part = clean(node.textContent || '');
      if (part) quoteTextParts.push(part);
    }

    const dirAutoTexts = getDirAutoTexts(quoteRoot).filter((text) => text !== 'Quote');
    const articleCard = extractArticleCard(quoteRoot);

    let quoteText = quoteTextParts.join('\n').trim();
    if (!quoteText && articleCard) {
      quoteText = [articleCard.title, articleCard.description].filter(Boolean).join('\n').trim();
    }
    if (!quoteText && dirAutoTexts.length > 0) {
      quoteText = dirAutoTexts.slice(0, 3).join('\n').trim();
    }

    let quoteAuthorHandle = '';
    let quoteAuthorName = '';
    if (quotedNameBlock && quotedNameBlock instanceof HTMLElement) {
      quoteAuthorHandle = parseAuthorHandle(quotedNameBlock);
      quoteAuthorName = parseAuthorName(quotedNameBlock);
    }
    if (!quoteAuthorHandle) {
      const avatar = quoteRoot.querySelector('[data-testid^="UserAvatar-Container-"]');
      if (avatar instanceof HTMLElement) {
        const dataTestId = clean(avatar.getAttribute('data-testid') || '');
        const match = dataTestId.match(/^UserAvatar-Container-(.+)$/);
        if (match && match[1]) {
          quoteAuthorHandle = match[1];
        }
      }
    }
    if (!quoteAuthorHandle && quoteStatus && quoteStatus.handle) {
      quoteAuthorHandle = quoteStatus.handle;
    }
    if (quoteAuthorHandle && quoteAuthorHandle === outerAuthorHandle && !quoteText && !articleCard) {
      return null;
    }

    return {
      postId: quoteStatus ? quoteStatus.postId : '',
      url: quoteStatus ? quoteStatus.url : '',
      text: quoteText,
      author: {
        handle: quoteAuthorHandle,
        name: quoteAuthorName,
        profileUrl: quoteAuthorHandle ? 'https://x.com/' + quoteAuthorHandle : '',
      },
      createdAt: '',
      article: articleCard,
    };
  };

  const detectLoginRequired = () => {
    return (
      window.location.pathname.indexOf('/i/flow/login') >= 0 ||
      document.querySelector('input[name="session[username_or_email]"]') !== null ||
      document.querySelector('input[autocomplete="username"]') !== null ||
      document.querySelector('a[href*="/i/flow/login"]') !== null ||
      document.querySelector('[data-testid="loginButton"]') !== null
    );
  };

  const extractOne = (article) => {
    const timeNode = article.querySelector('time');
    const statusAnchor =
      timeNode && timeNode.closest('a[href*="/status/"]')
        ? timeNode.closest('a[href*="/status/"]')
        : article.querySelector('a[href*="/status/"]');

    const statusHref =
      statusAnchor && statusAnchor instanceof HTMLAnchorElement
        ? statusAnchor.getAttribute('href') || ''
        : '';
    const status = parseStatusUrl(statusHref);

    const nameBlock = article.querySelector('div[data-testid="User-Name"]');
    const authorHandle =
      nameBlock instanceof HTMLElement
        ? parseAuthorHandle(nameBlock)
        : status && status.handle
          ? status.handle
          : '';
    const authorName = nameBlock instanceof HTMLElement ? parseAuthorName(nameBlock) : '';

    const textParts = [];
    for (const node of article.querySelectorAll('[data-testid="tweetText"]')) {
      if (!(node instanceof HTMLElement)) continue;
      const part = clean(node.textContent || '');
      if (part) textParts.push(part);
    }

    const time = article.querySelector('time');
    const createdAt =
      time instanceof HTMLTimeElement ? clean(time.getAttribute('datetime') || '') : '';

    const raw = clean(article.textContent || '').slice(0, 2400);
    const social = article.querySelector('[data-testid="socialContext"]');
    const socialText = clean(social ? social.textContent || '' : '');

    const quotedPost = extractQuotedPost(article, status ? status.url : '', authorHandle);
    const articleCardRaw = extractArticleCard(article);
    let articleCard = articleCardRaw;
    if (quotedPost && quotedPost.article && articleCardRaw) {
      const quotedArticle = quotedPost.article;
      const sameCover =
        quotedArticle.coverImageUrl &&
        articleCardRaw.coverImageUrl &&
        quotedArticle.coverImageUrl === articleCardRaw.coverImageUrl;
      const sameTitle =
        quotedArticle.title && articleCardRaw.title && quotedArticle.title === articleCardRaw.title;
      const sameDescription =
        quotedArticle.description &&
        articleCardRaw.description &&
        quotedArticle.description === articleCardRaw.description;
      const sameArticle = sameCover || sameTitle || (sameTitle && sameDescription);
      if (sameArticle) {
        articleCard = null;
      }
    }

    let text = textParts.join('\n').trim();
    if (!text && articleCard && articleCard.content) {
      text = articleCard.content;
    }
    if (!text && articleCard) {
      text = [articleCard.title, articleCard.description].filter(Boolean).join('\n').trim();
    }
    if (!text) {
      const altTexts = getDirAutoTexts(article).filter((entry) => {
        if (!entry) return false;
        if (entry === authorName) return false;
        if (authorHandle && entry === '@' + authorHandle) return false;
        if (/^\d+(\.\d+)?[KMB]?$/i.test(entry)) return false;
        return true;
      });
      if (altTexts.length > 0) {
        text = altTexts.slice(0, 3).join('\n').trim();
      }
    }

    return {
      postId: status ? status.postId : '',
      url: status ? status.url : '',
      text,
      author: {
        handle: authorHandle,
        name: authorName,
        profileUrl: authorHandle ? 'https://x.com/' + authorHandle : '',
      },
      createdAt,
      metrics: {
        replies: getMetric(article, 'reply'),
        reposts: getMetric(article, 'retweet'),
        likes: getMetric(article, 'like'),
        bookmarks: getMetric(article, 'bookmark'),
        views: getMetric(article, 'viewCount'),
      },
      media: extractMedia(article),
      article: articleCard,
      isReply: /\breplying to\b/i.test(raw),
      isRepost: /\breposted\b/i.test(socialText),
      isQuote: quotedPost !== null,
      quotedPost,
      isPromoted:
        /\bpromoted\b/i.test(raw) || article.querySelector('[data-testid="placementTracking"]') !== null,
    };
  };

  const articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
  const posts = [];
  for (const article of articles) {
    if (!(article instanceof HTMLElement)) continue;
    posts.push(extractOne(article));
  }

  return {
    page: {
      url: window.location.href,
      title: document.title,
      loginRequired: detectLoginRequired(),
      scrollY: Math.round(window.scrollY || window.pageYOffset || 0),
      viewportHeight: Math.round(window.innerHeight || 0),
      scrollHeight: Math.round(document.documentElement ? document.documentElement.scrollHeight : 0),
    },
    posts,
  };
})()`;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseInputPostUrl(input) {
  const raw = typeof input === 'string' ? input.trim() : '';
  if (!raw) throw new Error('postUrl is required');

  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('postUrl must be a valid URL');
  }

  const match = url.pathname.match(/^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)/);
  if (!match) {
    throw new Error('postUrl must match https://x.com/<handle>/status/<id>');
  }

  return {
    canonicalUrl: 'https://x.com/' + match[1] + '/status/' + match[2],
    handle: match[1],
    postId: match[2],
  };
}

async function waitForPostReady(input) {
  const timeoutMs = Math.max(8_000, typeof input.timeoutMs === 'number' ? input.timeoutMs : 30_000);
  const intervalMs = Math.max(600, typeof input.intervalMs === 'number' ? input.intervalMs : 1_000);
  const nudgePx = Math.max(120, typeof input.nudgePx === 'number' ? input.nudgePx : 220);

  const startedAt = Date.now();
  let polls = 0;
  let last = {};

  while (Date.now() - startedAt < timeoutMs) {
    const state = await window.evaluate(POST_STATE, { timeoutMs: 10_000 });
    last = state && typeof state === 'object' ? state : {};

    if (last && last.ready === true) {
      return {
        ...last,
        polls,
        waitedMs: Date.now() - startedAt,
      };
    }

    if (polls > 0 && polls % 2 === 0) {
      await window.scroll({ y: nudgePx, behavior: 'smooth', timeoutMs: 20_000 });
    }

    polls += 1;
    await sleep(intervalMs);
  }

  return {
    ...last,
    polls,
    waitedMs: Date.now() - startedAt,
    timeout: true,
  };
}

function buildPostKey(post) {
  if (!post || typeof post !== 'object') return '';

  const postId = typeof post.postId === 'string' ? post.postId.trim() : '';
  if (postId) return 'id:' + postId;

  const url = typeof post.url === 'string' ? post.url.trim() : '';
  if (url) return 'url:' + url;

  const author = post.author && typeof post.author === 'object' ? post.author : {};
  const handle = typeof author.handle === 'string' ? author.handle.trim().toLowerCase() : '';
  const createdAt = typeof post.createdAt === 'string' ? post.createdAt.trim() : '';
  const text = typeof post.text === 'string' ? post.text.trim().slice(0, 80) : '';
  if (handle || createdAt || text) return ['sig', handle, createdAt, text].join('|');

  return '';
}

async function readScrollState() {
  const state = await window.evaluate(
    String.raw`(() => {
      const y = Math.round(window.scrollY || window.pageYOffset || 0);
      const maxY = Math.max(
        0,
        (document.documentElement ? document.documentElement.scrollHeight : 0) - (window.innerHeight || 0)
      );
      return { y, maxY };
    })()`,
    { timeoutMs: 10_000 }
  );
  return state && typeof state === 'object' ? state : {};
}

async function naturalReplyScroll(distancePx, scrollDurationMs) {
  const chunks = 3;
  const perChunk = Math.max(120, Math.round(distancePx / chunks));
  let moved = 0;
  let stepsUsed = 0;

  const start = await readScrollState();
  let previousY = typeof start.y === 'number' ? start.y : 0;
  let maxY = typeof start.maxY === 'number' ? start.maxY : 0;

  for (let step = 0; step < chunks; step++) {
    await window.scroll({
      y: perChunk,
      behavior: 'smooth',
      timeoutMs: Math.max(10_000, scrollDurationMs + 5_000),
    });

    const state = await readScrollState();
    const nextY = typeof state.y === 'number' ? state.y : previousY;
    maxY = typeof state.maxY === 'number' ? state.maxY : maxY;
    moved += Math.max(0, nextY - previousY);
    previousY = nextY;
    stepsUsed += 1;

    if (nextY >= maxY - 2) break;
  }

  return {
    chunks,
    stepsUsed,
    perChunk,
    moved,
    endY: previousY,
    maxY,
    atBottom: previousY >= maxY - 2,
  };
}

async function getPost(input) {
  const parsed = parseInputPostUrl(input && input.postUrl);
  const includeReplies =
    input && typeof input.includeReplies === 'boolean' ? input.includeReplies : true;
  const maxReplyScrolls = Math.max(
    1,
    input && typeof input.maxReplyScrolls === 'number' ? input.maxReplyScrolls : 8
  );
  const maxReplies = Math.max(
    0,
    input && typeof input.maxReplies === 'number' ? input.maxReplies : 20
  );

  await window.open(parsed.canonicalUrl, {
    newTab: false,
    active: true,
    timeoutMs: 40_000,
  });

  const readiness = await waitForPostReady({
    timeoutMs: input && typeof input.waitTimeoutMs === 'number' ? input.waitTimeoutMs : 30_000,
  });

  const seen = new Set();
  const replies = [];
  const cycles = [];
  let stagnantCycles = 0;
  let targetPost = null;

  for (let cycle = 0; cycle < maxReplyScrolls; cycle++) {
    const page = await window.evaluate(EXTRACT_POST_PAGE, { timeoutMs: 20_000 });
    const posts = page && Array.isArray(page.posts) ? page.posts : [];
    const pageInfo = page && page.page && typeof page.page === 'object' ? page.page : {};

    for (const post of posts) {
      const postId = post && typeof post.postId === 'string' ? post.postId : '';
      if (postId === parsed.postId) {
        targetPost = post;
        break;
      }
    }
    if (!targetPost && posts.length > 0) {
      targetPost = posts[0];
    }
    const targetKey = buildPostKey(targetPost);
    let addedReplies = 0;
    for (const post of posts) {
      const key = buildPostKey(post);
      if (!key || seen.has(key)) continue;
      seen.add(key);

      const postId = post && typeof post.postId === 'string' ? post.postId : '';
      if (postId === parsed.postId || (targetKey && key === targetKey)) {
        targetPost = post;
        continue;
      }

      if (includeReplies && replies.length < maxReplies) {
        replies.push(post);
        addedReplies += 1;
      }
    }

    if (!includeReplies || replies.length >= maxReplies) break;

    const expectedRepliesRaw =
      targetPost && targetPost.metrics && typeof targetPost.metrics.replies === 'number'
        ? targetPost.metrics.replies
        : null;
    const expectedReplies =
      typeof expectedRepliesRaw === 'number' && expectedRepliesRaw > 0
        ? Math.round(expectedRepliesRaw)
        : null;

    const viewportHeight =
      typeof pageInfo.viewportHeight === 'number' && pageInfo.viewportHeight > 0
        ? pageInfo.viewportHeight
        : 900;
    const distancePx = Math.max(220, Math.round(viewportHeight * 0.82));
    const scrollMeta = await naturalReplyScroll(distancePx, 900);
    const moved = typeof scrollMeta.moved === 'number' ? Math.abs(scrollMeta.moved) : 0;

    if (addedReplies === 0 || moved < 3) {
      stagnantCycles += 1;
    } else {
      stagnantCycles = 0;
    }

    cycles.push({
      cycle,
      extractedOnCycle: posts.length,
      repliesCollected: replies.length,
      addedReplies,
      moved,
      stagnantCycles,
      expectedReplies,
    });

    if (expectedReplies !== null && replies.length >= Math.min(expectedReplies, maxReplies)) break;
    if (stagnantCycles >= 3) break;
  }

  return {
    requested: parsed,
    readiness,
    loginRequired: readiness && readiness.loginRequired === true,
    found: targetPost !== null,
    post: targetPost,
    replyCollection: {
      maxReplyScrolls,
      maxReplies,
      collectedReplies: replies.length,
      cycles,
    },
    replies,
  };
}

return await getPost({
  postUrl: 'https://x.com/elonmusk/status/2027991266173108303',
  includeReplies: true,
});
```
