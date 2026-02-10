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
