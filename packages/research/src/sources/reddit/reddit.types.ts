export interface RedditPost {
  /** Unique post ID (e.g. "t3_1r0vtn9") */
  postId: string;
  /** Post title */
  title: string;
  /** Author username (without u/) */
  author: string;
  /** Subreddit prefixed name (e.g. "r/claude") */
  subreddit: string;
  /** Score as displayed (e.g. "178") */
  score: string;
  /** Comment count as displayed (e.g. "27") */
  commentCount: string;
  /** Relative permalink (e.g. "/r/claude/comments/1r0vtn9/clauding/") */
  permalink: string;
  /** Full content URL (self post URL, image URL, video URL, or external link) */
  contentHref: string;
  /** ISO 8601 creation timestamp */
  createdTimestamp: string;
  /** Post type: "text", "image", "video", "crosspost", "multi_media", "link" */
  postType: string;
  /** Content domain (e.g. "self.claude", "i.redd.it", "v.redd.it", "github.com") */
  domain: string;
  /** Post flair text (e.g. "Discussion", "Showcase") */
  flair: string;
  /** Body text preview for text posts (truncated to ~500 chars) */
  bodyText: string;
  /** Thumbnail / preview image URL */
  thumbnailUrl: string;
  /** Whether the post is marked NSFW */
  isNsfw: boolean;
  /** Whether the post is marked as spoiler */
  isSpoiler: boolean;
  /** Whether this is a promoted/ad post */
  isPromoted: boolean;
  /** Whether this post is stickied (pinned by mods) */
  isStickied: boolean;
  /** Award count as displayed */
  awardCount: string;
}

export interface RedditComment {
  /** Unique comment ID (e.g. "t1_abc123") */
  commentId: string;
  /** Author username (without u/) */
  author: string;
  /** Comment text content */
  text: string;
  /** Score as displayed */
  score: string;
  /** ISO 8601 creation timestamp */
  createdTimestamp: string;
  /** Nesting depth (0 = top-level reply) */
  depth: number;
  /** Whether the author is the original poster */
  isOP: boolean;
}

export interface RedditPostWithComments {
  /** The post itself */
  post: RedditPost;
  /** Comments on the post */
  comments: RedditComment[];
}
