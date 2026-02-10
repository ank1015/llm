/**
 * Exploration script: Reddit subreddit page DOM structure
 *
 * Discovers: post selectors, content elements, stats, media,
 * pagination (infinite scroll vs. numbered), and structural variety.
 *
 * Run: npx tsx scripts/reddit/explore-reddit-subreddit.ts [subreddit]
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

// ---- Phase 1: Discover top-level structure ----

const DISCOVER_STRUCTURE_JS = `(() => {
  // What custom elements / data-testid / semantic containers exist?
  const customEls = new Set();
  document.querySelectorAll('*').forEach(el => {
    if (el.tagName.includes('-')) customEls.add(el.tagName.toLowerCase());
  });

  const testIds = new Set();
  document.querySelectorAll('[data-testid]').forEach(el => {
    testIds.add(el.getAttribute('data-testid'));
  });

  // Check for shreddit-post (new Reddit) or .thing (old Reddit)
  const shredditPosts = document.querySelectorAll('shreddit-post');
  const oldPosts = document.querySelectorAll('.thing.link');
  const articles = document.querySelectorAll('article');

  return {
    customElements: [...customEls].sort(),
    dataTestIds: [...testIds].sort(),
    shredditPostCount: shredditPosts.length,
    oldPostCount: oldPosts.length,
    articleCount: articles.length,
    url: location.href,
    title: document.title,
  };
})()`;

// ---- Phase 2: Inspect shreddit-post attributes & shadow DOM ----

const INSPECT_SHREDDIT_POSTS_JS = `(() => {
  const posts = document.querySelectorAll('shreddit-post');
  if (posts.length === 0) return { error: 'No shreddit-post elements found' };

  return Array.from(posts).slice(0, 5).map(post => {
    // Collect all attributes on the shreddit-post element
    const attrs = {};
    for (const attr of post.attributes) {
      attrs[attr.name] = attr.value;
    }

    // Check shadow root
    const hasShadow = !!post.shadowRoot;

    // Children summary
    const childTags = Array.from(post.children).map(c => ({
      tag: c.tagName.toLowerCase(),
      id: c.id || null,
      classes: c.className || null,
      slot: c.getAttribute('slot') || null,
      text: c.textContent?.substring(0, 100) || null,
    }));

    // Look for key content in the light DOM
    const title = post.getAttribute('post-title') || post.querySelector('h1,h2,h3')?.textContent || '';
    const author = post.getAttribute('author') || '';
    const score = post.getAttribute('score') || '';
    const commentCount = post.getAttribute('comment-count') || '';
    const permalink = post.getAttribute('permalink') || '';
    const contentHref = post.getAttribute('content-href') || '';
    const createdTimestamp = post.getAttribute('created-timestamp') || '';
    const subredditName = post.getAttribute('subreddit-prefixed-name') || '';
    const postType = post.getAttribute('post-type') || '';
    const isPromoted = post.hasAttribute('is-promoted');

    return {
      attributes: attrs,
      hasShadowRoot: hasShadow,
      childCount: post.children.length,
      childTags,
      extracted: {
        title,
        author,
        score,
        commentCount,
        permalink,
        contentHref,
        createdTimestamp,
        subredditName,
        postType,
        isPromoted,
      },
    };
  });
})()`;

// ---- Phase 3: Extract post data from attributes ----

const EXTRACT_POSTS_JS = `(() => {
  const posts = document.querySelectorAll('shreddit-post');
  return Array.from(posts).map(post => {
    // Most data lives in attributes on the shreddit-post element
    const get = (name) => post.getAttribute(name) || '';

    // Flair
    const flairEl = post.querySelector('shreddit-post-flair, flair-badge');
    const flair = flairEl?.textContent?.trim() || '';

    // Thumbnail / preview image
    const thumbEl = post.querySelector('img[src*="preview"], img[src*="thumb"], img[src*="external-preview"]');
    const thumbnailUrl = thumbEl?.getAttribute('src') || '';

    // Post body text (for text posts, may be in a div or paragraph inside)
    const bodyEl = post.querySelector('[slot="text-body"], .md, .RichTextJSON-root');
    const bodyText = bodyEl?.textContent?.trim()?.substring(0, 500) || '';

    // Awards (if visible)
    const awardsEl = post.querySelector('[slot="award-button"]');
    const awards = awardsEl?.textContent?.trim() || '';

    return {
      postId: get('id'),
      title: get('post-title'),
      author: get('author'),
      subreddit: get('subreddit-prefixed-name'),
      score: get('score'),
      commentCount: get('comment-count'),
      permalink: get('permalink'),
      contentHref: get('content-href'),
      createdTimestamp: get('created-timestamp'),
      postType: get('post-type'),
      domain: get('domain'),
      isNsfw: post.hasAttribute('nsfw'),
      isSpoiler: post.hasAttribute('spoiler'),
      isPromoted: post.hasAttribute('is-promoted') || post.hasAttribute('is-blank'),
      isStickied: post.hasAttribute('stickied'),
      flair,
      thumbnailUrl,
      bodyText,
      awards,
    };
  });
})()`;

// ---- Phase 4: Scroll and check for new posts ----

const SCROLL_DOWN_JS = `(() => {
  const before = window.scrollY;
  window.scrollBy({ top: 800, behavior: 'smooth' });
  return {
    before,
    after: window.scrollY,
    docHeight: document.body.scrollHeight,
    postCount: document.querySelectorAll('shreddit-post').length,
  };
})()`;

async function main(): Promise<void> {
  const subreddit = process.argv[2] || 'programming';
  const chrome = await connect({ launch: true });

  console.log(`--- Opening r/${subreddit} ---`);
  const tab = (await chrome.call('tabs.create', {
    url: `https://www.reddit.com/r/${subreddit}/`,
    active: true,
  })) as { id: number };
  const tabId = tab.id;
  console.log('Tab created:', tabId);

  console.log('Waiting for page to load...');
  await sleep(5000);

  // Phase 1: Top-level structure
  console.log('\n=== PHASE 1: DOM Structure ===');
  const structure = await evaluate(chrome, tabId, DISCOVER_STRUCTURE_JS);
  console.log(JSON.stringify(structure, null, 2));

  // Phase 2: Inspect shreddit-post elements
  console.log('\n=== PHASE 2: shreddit-post Inspection ===');
  const inspection = await evaluate(chrome, tabId, INSPECT_SHREDDIT_POSTS_JS);
  console.log(JSON.stringify(inspection, null, 2));

  // Phase 3: Extract posts
  console.log('\n=== PHASE 3: Extracted Posts ===');
  const posts = (await evaluate(chrome, tabId, EXTRACT_POSTS_JS)) as Array<Record<string, unknown>>;
  console.log(`Found ${posts.length} posts\n`);

  // Summary of each post
  for (const p of posts) {
    const promoted = p.isPromoted ? ' [PROMOTED]' : '';
    const stickied = p.isStickied ? ' [STICKIED]' : '';
    const nsfw = p.isNsfw ? ' [NSFW]' : '';
    console.log(
      `  [${p.postType}] ${String(p.title).substring(0, 80)} | ${p.score} pts | ${p.commentCount} comments${promoted}${stickied}${nsfw}`
    );
    console.log(`    by u/${p.author} in ${p.subreddit} | ${p.permalink}`);
    if (p.flair) console.log(`    Flair: ${p.flair}`);
    if (p.bodyText) console.log(`    Body: ${String(p.bodyText).substring(0, 120)}...`);
    console.log('');
  }

  // Phase 4: Scroll test
  console.log('\n=== PHASE 4: Scroll Test (3 scrolls) ===');
  const seenIds = new Set<string>();
  for (const p of posts) {
    const id = String(p.postId);
    if (id) seenIds.add(id);
  }

  for (let i = 0; i < 3; i++) {
    const scrollResult = (await evaluate(chrome, tabId, SCROLL_DOWN_JS)) as Record<string, number>;
    console.log(
      `  Scroll #${i + 1}: ${scrollResult.before} -> ${scrollResult.after} (doc: ${scrollResult.docHeight}, DOM posts: ${scrollResult.postCount})`
    );
    await sleep(2000);

    const newPosts = (await evaluate(chrome, tabId, EXTRACT_POSTS_JS)) as Array<
      Record<string, unknown>
    >;
    let newCount = 0;
    for (const p of newPosts) {
      const id = String(p.postId);
      if (id && !seenIds.has(id)) {
        seenIds.add(id);
        newCount++;
      }
    }
    console.log(`    ${newPosts.length} in DOM, ${newCount} new (total unique: ${seenIds.size})`);
  }

  // Dump raw JSON of first 3 posts
  console.log('\n=== RAW JSON (first 3 posts) ===');
  console.log(JSON.stringify(posts.slice(0, 3), null, 2));
}

main().catch(console.error);
