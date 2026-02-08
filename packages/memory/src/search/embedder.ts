/**
 * Embedder — generates vector embeddings for text using OpenAI.
 * Uses text-embedding-3-small for low cost and good quality.
 */

import OpenAI from 'openai';

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

/** OpenAI embedder using text-embedding-3-small */
export class OpenAIEmbedder implements Embedder {
  private readonly client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async embed(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const response = await this.client.embeddings.create({
      model: 'text-embedding-3-small',
      input: texts,
      encoding_format: 'float',
    });

    // Sort by index to ensure order matches input
    const sorted = response.data.sort((a, b) => a.index - b.index);
    return sorted.map((item) => item.embedding);
  }
}

/**
 * Cosine similarity between two vectors.
 * OpenAI embeddings are normalized to length 1, so this is just a dot product.
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i]! * b[i]!;
  }
  return dot;
}
