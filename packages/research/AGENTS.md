# @ank1015/llm-research

Browser-based research utilities. Combines the extension package (browser control) with LLM capabilities to extract structured data from web sources.

## Commands

```bash
pnpm build        # Build the package
pnpm dev          # Build in watch mode
pnpm test         # Run all tests
pnpm test:watch   # Run tests in watch mode
pnpm typecheck    # Type-check without emitting
pnpm clean        # Remove build artifacts
```

## Structure

```
src/
  index.ts              # Public exports
  sources/
    index.ts            # Re-exports all sources
    x/                  # Twitter/X source
      index.ts          # Exports: createXSource()
      x.source.ts       # Implementation (uses ChromeClient)
      x.types.ts        # XTweet, XProfile, XUserProfileResult
    reddit/             # Reddit source
      index.ts          # Exports: createRedditSource()
      reddit.source.ts  # Implementation (3 methods, 2 extraction strategies)
      reddit.types.ts   # RedditPost, RedditComment, RedditPostWithComments
    substack/           # Substack source
      index.ts          # Exports: createSubstackSource()
      substack.source.ts # Implementation (2 methods)
      substack.types.ts # SubstackPost, SubstackPostDetail
    discord/            # Discord source
      index.ts          # Exports: createDiscordSource()
      discord.source.ts # Implementation (1 method, scroll-up collection)
      discord.types.ts  # DiscordMessage, DiscordReplyInfo, DiscordReaction
scripts/
  x/                    # X exploration & test scripts
  reddit/               # Reddit exploration & test scripts
  substack/             # Substack exploration & test scripts
  discord/              # Discord exploration & test scripts
```

## Sources

### X (Twitter) — `createXSource({ chrome })`

- `getFeedPosts({ count? })` — logged-in user's feed
- `searchPosts({ query, count?, since?, sort? })` — search with date/sort filters
- `getUserProfile({ username, postCount? })` — profile + tweets

### Reddit — `createRedditSource({ chrome })`

- `getSubredditPosts({ subreddit, count?, sort?, time? })` — subreddit feed
- `searchPosts({ query, subreddit?, count?, sort?, time? })` — global or subreddit-scoped search
- `getPostComments({ postUrl, count? })` — post detail + threaded comments

**Reddit DOM notes:** Subreddit pages use `shreddit-post` elements (data in attributes). Search pages use a different DOM (`sdui-post-unit` with `post-title-text`, `faceplate-number`, `faceplate-timeago`). Comments use `shreddit-comment` elements. All Reddit pages require `active: true` tabs (lazy rendering via IntersectionObserver).

### Substack — `createSubstackSource({ chrome })`

- `searchPosts({ query, count?, dateRange? })` — search across all of Substack (fixed 20 results, no infinite scroll)
- `getPost({ url })` — full article content from a post URL, with paywall detection

**Substack DOM notes:** No `data-testid` attributes — uses `reader2-*` class selectors for search, `.post-title` / `.subtitle` / `.body.markup` for post pages. Engagement counts extracted from `aria-label` on `.post-ufi-button` elements. Paywalled posts return partial body text with `isPaywalled: true`. Author links at `a[href*="/@"]` — first match is often an avatar (no text), iterate to find one with text content.

### Discord — `createDiscordSource({ chrome })`

- `getMessages({ url, count?, sinceHours? })` — channel messages by count or time window

**Discord DOM notes:** Messages use `li[id^="chat-messages-{channelId}-{messageId}"]` with `role="article"` inner divs. Group-start messages have full author headers (`data-text` attribute on username span); continuation messages inherit author from the preceding group start. The scrollable container is a `div[role="group"]` ancestor of `ol[data-list-id="chat-messages"]` — NOT the OL itself. Scrolling UP loads older messages in ~30-message batches. Page may open at the "new messages" divider (mid-history), so scroll to bottom first to normalise. Requires `active: true` tabs.

## Adding a New Source

See `ADD_NEW_SOURCE_GUIDE.md` for the full walkthrough. Summary:

1. Create `src/sources/<name>/` with types, source, and barrel index
2. Write exploration scripts in `scripts/<name>/` to inspect DOM
3. Implement with factory pattern, scroll-dedup loop, and `debugger.evaluate`
4. Re-export from `src/sources/index.ts`
5. Create test scripts and verify with real browser

## Dependencies

- Depends on: `@ank1015/llm-extension` (browser control)
- Depended on by: (none yet)
