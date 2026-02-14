import fs from 'node:fs';
import path from 'node:path';

import Database from 'better-sqlite3';

const X_POSTS_SCHEMA = `
CREATE TABLE IF NOT EXISTS x_posts (
  tweet_id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  handle TEXT NOT NULL,
  is_verified INTEGER NOT NULL DEFAULT 0,
  avatar_url TEXT NOT NULL DEFAULT '',
  text TEXT NOT NULL,
  links TEXT NOT NULL DEFAULT '[]',
  timestamp TEXT NOT NULL DEFAULT '',
  relative_time TEXT NOT NULL DEFAULT '',
  replies TEXT NOT NULL DEFAULT '0',
  retweets TEXT NOT NULL DEFAULT '0',
  likes TEXT NOT NULL DEFAULT '0',
  views TEXT NOT NULL DEFAULT '0',
  is_liked INTEGER NOT NULL DEFAULT 0,
  is_bookmarked INTEGER NOT NULL DEFAULT 0,
  social_context TEXT NOT NULL DEFAULT '',
  is_repost INTEGER NOT NULL DEFAULT 0,
  is_pinned INTEGER NOT NULL DEFAULT 0,
  images TEXT NOT NULL DEFAULT '[]',
  has_video INTEGER NOT NULL DEFAULT 0,
  card_link TEXT NOT NULL DEFAULT '',
  card_title TEXT NOT NULL DEFAULT '',
  quote_tweet TEXT,
  permalink TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

/**
 * Creates and initializes a SQLite database.
 *
 * @param dbPath - Path to the SQLite file, or `:memory:` for in-memory DB
 * @returns Initialized better-sqlite3 Database instance
 */
export function createDb(dbPath?: string): Database.Database {
  const resolvedPath = dbPath ?? path.join(process.cwd(), 'data', 'feed.db');

  if (resolvedPath !== ':memory:') {
    const dir = path.dirname(resolvedPath);
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(resolvedPath);
  db.pragma('journal_mode = WAL');
  db.exec(X_POSTS_SCHEMA);

  return db;
}
