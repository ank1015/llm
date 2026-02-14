import type { XTweet } from '@ank1015/llm-research';
import type Database from 'better-sqlite3';

export interface XPostsRepository {
  insert: (tweets: XTweet[]) => number;
  findAll: (page: number, limit: number) => XTweet[];
  count: () => number;
}

interface XPostRow {
  tweet_id: string;
  display_name: string;
  handle: string;
  is_verified: number;
  avatar_url: string;
  text: string;
  links: string;
  timestamp: string;
  relative_time: string;
  replies: string;
  retweets: string;
  likes: string;
  views: string;
  is_liked: number;
  is_bookmarked: number;
  social_context: string;
  is_repost: number;
  is_pinned: number;
  images: string;
  has_video: number;
  card_link: string;
  card_title: string;
  quote_tweet: string | null;
  permalink: string;
  created_at: string;
}

function tweetToRow(tweet: XTweet): Omit<XPostRow, 'created_at'> {
  return {
    tweet_id: tweet.tweetId,
    display_name: tweet.displayName,
    handle: tweet.handle,
    is_verified: tweet.isVerified ? 1 : 0,
    avatar_url: tweet.avatarUrl,
    text: tweet.text,
    links: JSON.stringify(tweet.links),
    timestamp: tweet.timestamp,
    relative_time: tweet.relativeTime,
    replies: tweet.replies,
    retweets: tweet.retweets,
    likes: tweet.likes,
    views: tweet.views,
    is_liked: tweet.isLiked ? 1 : 0,
    is_bookmarked: tweet.isBookmarked ? 1 : 0,
    social_context: tweet.socialContext,
    is_repost: tweet.isRepost ? 1 : 0,
    is_pinned: tweet.isPinned ? 1 : 0,
    images: JSON.stringify(tweet.images),
    has_video: tweet.hasVideo ? 1 : 0,
    card_link: tweet.cardLink,
    card_title: tweet.cardTitle,
    quote_tweet: tweet.quoteTweet ? JSON.stringify(tweet.quoteTweet) : null,
    permalink: tweet.permalink,
  };
}

function rowToTweet(row: XPostRow): XTweet {
  return {
    tweetId: row.tweet_id,
    displayName: row.display_name,
    handle: row.handle,
    isVerified: row.is_verified === 1,
    avatarUrl: row.avatar_url,
    text: row.text,
    links: JSON.parse(row.links) as XTweet['links'],
    timestamp: row.timestamp,
    relativeTime: row.relative_time,
    replies: row.replies,
    retweets: row.retweets,
    likes: row.likes,
    views: row.views,
    isLiked: row.is_liked === 1,
    isBookmarked: row.is_bookmarked === 1,
    socialContext: row.social_context,
    isRepost: row.is_repost === 1,
    isPinned: row.is_pinned === 1,
    images: JSON.parse(row.images) as XTweet['images'],
    hasVideo: row.has_video === 1,
    cardLink: row.card_link,
    cardTitle: row.card_title,
    quoteTweet: row.quote_tweet ? (JSON.parse(row.quote_tweet) as XTweet['quoteTweet']) : null,
    permalink: row.permalink,
  };
}

const INSERT_SQL = `INSERT OR IGNORE INTO x_posts (
  tweet_id, display_name, handle, is_verified, avatar_url,
  text, links, timestamp, relative_time,
  replies, retweets, likes, views,
  is_liked, is_bookmarked, social_context, is_repost, is_pinned,
  images, has_video, card_link, card_title, quote_tweet, permalink
) VALUES (
  @tweet_id, @display_name, @handle, @is_verified, @avatar_url,
  @text, @links, @timestamp, @relative_time,
  @replies, @retweets, @likes, @views,
  @is_liked, @is_bookmarked, @social_context, @is_repost, @is_pinned,
  @images, @has_video, @card_link, @card_title, @quote_tweet, @permalink
)`;

/**
 * Creates a repository for x_posts table operations.
 */
export function createXPostsRepository(db: Database.Database): XPostsRepository {
  const insertStmt = db.prepare(INSERT_SQL);
  const insertMany = db.transaction((rows: Omit<XPostRow, 'created_at'>[]) => {
    let inserted = 0;
    for (const row of rows) {
      const result = insertStmt.run(row);
      inserted += result.changes;
    }
    return inserted;
  });

  const selectStmt = db.prepare<[number, number]>(
    'SELECT * FROM x_posts ORDER BY timestamp DESC LIMIT ? OFFSET ?'
  );

  const countStmt = db.prepare('SELECT COUNT(*) as total FROM x_posts');

  return {
    insert(tweets: XTweet[]): number {
      const rows = tweets.map(tweetToRow);
      return insertMany(rows);
    },

    findAll(page: number, limit: number): XTweet[] {
      const offset = (page - 1) * limit;
      const rows = selectStmt.all(limit, offset) as XPostRow[];
      return rows.map(rowToTweet);
    },

    count(): number {
      const row = countStmt.get() as { total: number };
      return row.total;
    },
  };
}
