export interface XTweetLink {
  /** Displayed link text */
  text: string;
  /** Raw href (often t.co shortened) */
  href: string;
}

export interface XTweetImage {
  /** Image URL */
  src: string;
  /** Alt text */
  alt: string;
}

export interface XQuoteTweet {
  /** Quoted tweet text */
  text: string;
  /** Raw User-Name element text */
  user: string;
  /** Permalink to quoted tweet */
  permalink: string;
}

export interface XTweet {
  /** Unique tweet ID extracted from permalink */
  tweetId: string;
  /** Author display name */
  displayName: string;
  /** Author handle including @ (e.g. "@dylan522p") */
  handle: string;
  /** Whether the author has a verified badge */
  isVerified: boolean;
  /** Author profile image URL */
  avatarUrl: string;

  /** Full tweet text content */
  text: string;
  /** Links embedded in the tweet text */
  links: XTweetLink[];

  /** ISO 8601 timestamp */
  timestamp: string;
  /** Relative time string (e.g. "13h") */
  relativeTime: string;

  /** Reply count as displayed (e.g. "18", "1.2K") */
  replies: string;
  /** Retweet count as displayed */
  retweets: string;
  /** Like count as displayed */
  likes: string;
  /** View count as displayed */
  views: string;

  /** Whether the logged-in user has liked this tweet */
  isLiked: boolean;
  /** Whether the logged-in user has bookmarked this tweet */
  isBookmarked: boolean;

  /** Social context text (e.g. "Saumya Saxena reposted") */
  socialContext: string;
  /** Whether this tweet appears via someone else reposting it */
  isRepost: boolean;
  /** Whether this tweet is pinned */
  isPinned: boolean;

  /** Images attached to the tweet */
  images: XTweetImage[];
  /** Whether the tweet contains a video */
  hasVideo: boolean;

  /** Link card URL if present */
  cardLink: string;
  /** Link card title if present */
  cardTitle: string;

  /** Quoted tweet data if this is a quote tweet */
  quoteTweet: XQuoteTweet | null;

  /** Relative permalink (e.g. "/user/status/123") */
  permalink: string;
}

export interface XProfileLink {
  /** Displayed text */
  text: string;
  /** Link href */
  href: string;
}

export interface XProfile {
  /** Display name */
  displayName: string;
  /** Handle including @ (e.g. "@ank1015") */
  handle: string;
  /** Whether the account has a verified badge */
  isVerified: boolean;
  /** Bio / description text */
  bio: string;
  /** Links found in the bio */
  bioLinks: XProfileLink[];
  /** Location string (may be empty) */
  location: string;
  /** Website display text (e.g. "ank1015.com") */
  website: string;
  /** Website full href */
  websiteUrl: string;
  /** Join date text (e.g. "Joined July 2025") */
  joinDate: string;
  /** Following count text (e.g. "432 Following") */
  followingCount: string;
  /** Followers count text (e.g. "75 Followers") */
  followersCount: string;
  /** Profile image URL */
  avatarUrl: string;
  /** Banner / header image URL */
  bannerUrl: string;
  /** Professional category if present */
  category: string;
}

export interface XUserProfileResult {
  /** Profile information */
  profile: XProfile;
  /** User's tweets */
  tweets: XTweet[];
}
