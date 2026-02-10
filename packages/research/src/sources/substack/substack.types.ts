export interface SubstackPost {
  /** Post title */
  title: string;
  /** Subtitle / preview text */
  subtitle: string;
  /** Full post URL (UTM params stripped) */
  url: string;

  /** Publication name (e.g. "Ben's Bites") */
  publicationName: string;
  /** Publication home URL */
  publicationUrl: string;
  /** Publication icon image URL */
  publicationIconUrl: string;

  /** Author name (may be empty if not shown) */
  author: string;
  /** Read time as displayed (e.g. "8 min read") */
  readTime: string;

  /** Date as displayed (e.g. "Jan 20") — no ISO timestamp available on search page */
  date: string;

  /** Post thumbnail image URL (may be empty) */
  thumbnailUrl: string;
}

export interface SubstackPostDetail {
  /** Post title */
  title: string;
  /** Subtitle / description */
  subtitle: string;
  /** Canonical post URL */
  url: string;

  /** Publication name */
  publicationName: string;
  /** Author name */
  author: string;
  /** Author Substack profile URL (e.g. "https://substack.com/@user") */
  authorUrl: string;

  /** Date as displayed in the byline (e.g. "Jan 29, 2026") */
  date: string;

  /** Full article body as plain text (free preview if paywalled) */
  bodyText: string;

  /** Like count as displayed (e.g. "78") */
  likes: string;
  /** Comment count as displayed (e.g. "6") */
  comments: string;

  /** Whether the post is behind a paywall (body may be truncated) */
  isPaywalled: boolean;
}
