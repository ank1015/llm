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
 * Normalized lifecycle stage for generated images.
 */
export type GeneratedImageStage = 'partial' | 'thought' | 'final';

/**
 * Optional metadata stored alongside image content.
 *
 * Generated images use the normalized fields below while still allowing
 * application-specific metadata to coexist on the same object.
 */
export interface ImageMetadata extends Record<string, unknown> {
  /** Generated image lifecycle stage when the image came from model output */
  generationStage?: GeneratedImageStage;
  /** Provider that produced the image */
  generationProvider?: 'google' | 'openai';
  /** Provider-native item/call identifier */
  generationProviderItemId?: string;
  /** Partial preview index for streaming image updates */
  generationPartialImageIndex?: number;
  /** Image generation/editing action when supplied by the provider */
  generationAction?: 'generate' | 'edit' | 'auto' | (string & {});
  /** Provider-revised prompt for the generated image */
  generationRevisedPrompt?: string;
  /** Output size such as 1024x1024 */
  generationOutputSize?: string;
  /** Output quality such as low/medium/high/auto */
  generationOutputQuality?: string;
  /** Output background such as opaque/transparent/auto */
  generationOutputBackground?: string;
  /** Output image format such as png/jpeg/webp */
  generationOutputFormat?: string;
}

/**
 * Stronger metadata contract for generated images.
 */
export interface GeneratedImageMetadata extends ImageMetadata {
  generationStage: GeneratedImageStage;
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
  metadata?: ImageMetadata;
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
