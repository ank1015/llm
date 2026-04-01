/**
 * Content types for messages
 *
 * Defines the different types of content that can be included in messages:
 * text, images, and files.
 */

/**
 * Text content block.
 */
export interface TextContent {
  type: 'text';
  content: string;
  /** Optional metadata for storage/application purposes */
  metadata?: Record<string, unknown>;
}

/**
 * Image content block with base64-encoded data.
 */
export interface ImageContent {
  type: 'image';
  /** Base64 encoded image data */
  data: string;
  /** MIME type, e.g., "image/jpeg", "image/png" */
  mimeType: string;
  /** Optional metadata for storage/application purposes */
  metadata?: Record<string, unknown>;
}

/**
 * File content block with base64-encoded data.
 */
export interface FileContent {
  type: 'file';
  /** Base64 encoded file data */
  data: string;
  /** MIME type, e.g., "application/pdf" */
  mimeType: string;
  /** Original filename */
  filename: string;
  /** Optional metadata for storage/application purposes */
  metadata?: Record<string, unknown>;
}

/**
 * Array of content blocks that can include text, images, and files.
 *
 * @example
 * const content: Content = [
 *   { type: 'text', content: 'Hello world' },
 *   { type: 'image', data: 'base64...', mimeType: 'image/png' }
 * ];
 */
export type Content = (TextContent | ImageContent | FileContent)[];