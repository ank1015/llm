export interface DiscordMessageLink {
  /** Displayed link text */
  text: string;
  /** Link href */
  href: string;
}

export interface DiscordMessageEmoji {
  /** Emoji name (e.g. ":eyes:") */
  name: string;
  /** Emoji alt text (e.g. the unicode character) */
  alt: string;
}

export interface DiscordMessageAttachment {
  /** Image/file URL */
  src: string;
  /** Alt text */
  alt: string;
}

export interface DiscordReaction {
  /** Emoji text or name */
  emoji: string;
  /** Reaction count as displayed */
  count: string;
}

export interface DiscordReplyInfo {
  /** Author of the message being replied to */
  author: string;
  /** Message ID being replied to */
  replyToMessageId: string;
  /** Preview text of the replied message */
  text: string;
}

export interface DiscordMessage {
  /** Unique message ID (Discord snowflake) */
  messageId: string;
  /** Author display name */
  author: string;
  /** Author avatar URL */
  avatarUrl: string;
  /** Whether this message starts a new author group (has full header) */
  isGroupStart: boolean;

  /** ISO 8601 timestamp */
  timestamp: string;
  /** Relative time text as displayed (e.g. "12:30 AM", "Yesterday at 10:47 PM") */
  timeText: string;

  /** Message text content */
  text: string;
  /** Links embedded in the message */
  links: DiscordMessageLink[];
  /** Custom emojis in the message */
  emojis: DiscordMessageEmoji[];

  /** Reply context if this message is a reply */
  replyInfo: DiscordReplyInfo | null;

  /** Number of embed elements (link previews, etc.) */
  embedCount: number;
  /** Attached images/files */
  attachments: DiscordMessageAttachment[];
  /** Reactions on this message */
  reactions: DiscordReaction[];
}
