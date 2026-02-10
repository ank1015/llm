/**
 * Exploration script: Reddit post comments page DOM structure
 *
 * Run: npx tsx scripts/reddit/explore-reddit-comments.ts [postUrl]
 *
 * Examples:
 *   npx tsx scripts/reddit/explore-reddit-comments.ts /r/claude/comments/1qzg6q6/claude_daily_limit_is_crazy/
 *   npx tsx scripts/reddit/explore-reddit-comments.ts https://www.reddit.com/r/ClaudeAI/comments/1qyrnti/tell_me_how_im_under_utilizing_claudeclaude_code/
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
  const customEls = new Set();
  document.querySelectorAll('*').forEach(el => {
    if (el.tagName.includes('-')) customEls.add(el.tagName.toLowerCase());
  });

  const testIds = new Set();
  document.querySelectorAll('[data-testid]').forEach(el => {
    testIds.add(el.getAttribute('data-testid'));
  });

  // Comment-related elements
  const shredditComments = document.querySelectorAll('shreddit-comment');
  const commentTrees = document.querySelectorAll('shreddit-comment-tree');
  const commentActions = document.querySelectorAll('shreddit-comment-action-row');

  // The post itself at the top
  const shredditPost = document.querySelector('shreddit-post');
  const hasPost = !!shredditPost;

  return {
    url: location.href,
    title: document.title,
    customElements: [...customEls].filter(e =>
      e.includes('comment') || e.includes('post') || e.includes('thread')
    ).sort(),
    allCustomElements: [...customEls].sort(),
    dataTestIds: [...testIds].sort(),
    shredditCommentCount: shredditComments.length,
    commentTreeCount: commentTrees.length,
    commentActionCount: commentActions.length,
    hasShredditPost: hasPost,
  };
})()`;

// ---- Phase 2: Inspect the post at the top ----

const INSPECT_POST_JS = `(() => {
  const post = document.querySelector('shreddit-post');
  if (!post) return { error: 'No shreddit-post found' };

  const get = (name) => post.getAttribute(name) || '';

  const bodyEl = post.querySelector('[slot="text-body"], .md, .RichTextJSON-root, [data-testid="post-rtjson-content"]');
  const bodyText = bodyEl?.textContent?.trim()?.substring(0, 1000) || '';

  return {
    postId: get('id'),
    title: get('post-title'),
    author: get('author'),
    subreddit: get('subreddit-prefixed-name'),
    score: get('score'),
    commentCount: get('comment-count'),
    permalink: get('permalink'),
    createdTimestamp: get('created-timestamp'),
    postType: get('post-type'),
    domain: get('domain'),
    bodyText,
  };
})()`;

// ---- Phase 3: Inspect comment elements ----

const INSPECT_COMMENTS_JS = `(() => {
  const comments = document.querySelectorAll('shreddit-comment');
  if (comments.length === 0) return { error: 'No shreddit-comment elements found', commentCount: 0 };

  const details = Array.from(comments).slice(0, 8).map((comment, idx) => {
    // All attributes
    const attrs = {};
    for (const attr of comment.attributes) {
      attrs[attr.name] = attr.value;
    }

    // Key data
    const author = comment.getAttribute('author') || '';
    const score = comment.getAttribute('score') || '';
    const depth = comment.getAttribute('depth') || '';
    const thingId = comment.getAttribute('thingid') || comment.getAttribute('thing-id') || '';
    const parentId = comment.getAttribute('parentid') || comment.getAttribute('parent-id') || '';
    const permalink = comment.getAttribute('permalink') || '';
    const createdTimestamp = comment.getAttribute('created-timestamp') || '';
    const isOP = comment.hasAttribute('is-op') || comment.hasAttribute('author-is-op');

    // Comment text
    const bodyEl = comment.querySelector('[slot="comment"], [id*="comment-content"], .md, .RichTextJSON-root');
    const bodyText = bodyEl?.textContent?.trim()?.substring(0, 300) || '';

    // Children summary
    const childTags = Array.from(comment.children).slice(0, 5).map(c => ({
      tag: c.tagName.toLowerCase(),
      slot: c.getAttribute('slot') || null,
      testId: c.getAttribute('data-testid') || null,
      text: c.textContent?.trim()?.substring(0, 80) || null,
    }));

    // Inner testIds
    const innerTestIds = new Set();
    comment.querySelectorAll('[data-testid]').forEach(el => {
      innerTestIds.add(el.getAttribute('data-testid'));
    });

    return {
      index: idx,
      attributeNames: Object.keys(attrs).sort(),
      key: { author, score, depth, thingId, parentId, permalink, createdTimestamp, isOP },
      bodyText,
      childTags,
      innerTestIds: [...innerTestIds].sort(),
    };
  });

  return {
    totalComments: comments.length,
    details,
  };
})()`;

// ---- Phase 4: Check for "load more" / collapsed comments ----

const CHECK_MORE_COMMENTS_JS = `(() => {
  // "More replies" / "Continue thread" buttons
  const moreReplies = document.querySelectorAll('[id*="more-comments"], [data-testid*="more"], button[slot="more-comments"]');
  const continueThread = document.querySelectorAll('a[href*="?context="], [data-testid*="continue"]');
  const collapsed = document.querySelectorAll('[collapsed], [data-collapsed]');

  // faceplate-partial loaders (lazy-loaded comments)
  const partials = document.querySelectorAll('faceplate-partial[loading="lazy"]');

  return {
    moreRepliesCount: moreReplies.length,
    continueThreadCount: continueThread.length,
    collapsedCount: collapsed.length,
    lazyPartialCount: partials.length,
    moreRepliesInfo: Array.from(moreReplies).slice(0, 3).map(el => ({
      tag: el.tagName.toLowerCase(),
      text: el.textContent?.trim()?.substring(0, 100) || '',
      id: el.id || null,
      slot: el.getAttribute('slot') || null,
    })),
  };
})()`;

// ---- Phase 5: Scroll test ----

const SCROLL_DOWN_JS = `(() => {
  const before = window.scrollY;
  window.scrollBy({ top: 800, behavior: 'smooth' });
  return {
    before,
    after: window.scrollY,
    docHeight: document.body.scrollHeight,
    commentCount: document.querySelectorAll('shreddit-comment').length,
  };
})()`;

async function main(): Promise<void> {
  const rawUrl = process.argv[2] || '/r/claude/comments/1qzg6q6/claude_daily_limit_is_crazy/';
  const url = rawUrl.startsWith('http') ? rawUrl : `https://www.reddit.com${rawUrl}`;

  const chrome = await connect({ launch: true });

  console.log(`--- Opening: ${url} ---`);
  const tab = (await chrome.call('tabs.create', { url, active: true })) as { id: number };
  const tabId = tab.id;
  console.log('Waiting for page to load...');
  await sleep(6000);

  // Phase 1
  console.log('\n=== PHASE 1: Page Structure ===');
  const structure = await evaluate(chrome, tabId, DISCOVER_STRUCTURE_JS);
  console.log(JSON.stringify(structure, null, 2));

  // Phase 2
  console.log('\n=== PHASE 2: Post at Top ===');
  const post = await evaluate(chrome, tabId, INSPECT_POST_JS);
  console.log(JSON.stringify(post, null, 2));

  // Phase 3
  console.log('\n=== PHASE 3: Comment Elements ===');
  const comments = await evaluate(chrome, tabId, INSPECT_COMMENTS_JS);
  console.log(JSON.stringify(comments, null, 2));

  // Phase 4
  console.log('\n=== PHASE 4: Load More / Collapsed ===');
  const more = await evaluate(chrome, tabId, CHECK_MORE_COMMENTS_JS);
  console.log(JSON.stringify(more, null, 2));

  // Phase 5: Scroll test
  console.log('\n=== PHASE 5: Scroll Test (3 scrolls) ===');
  for (let i = 0; i < 3; i++) {
    const scrollResult = (await evaluate(chrome, tabId, SCROLL_DOWN_JS)) as Record<string, number>;
    console.log(
      `  Scroll #${i + 1}: ${scrollResult.before} -> ${scrollResult.after} (doc: ${scrollResult.docHeight}, comments: ${scrollResult.commentCount})`
    );
    await sleep(2000);
  }
}

main().catch(console.error);
