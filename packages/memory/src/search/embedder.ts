/**
 * Embedder — generates vector embeddings for text using OpenAI.
 * Uses text-embedding-3-small for low cost and good quality.
 */

export interface Embedder {
  embed(texts: string[]): Promise<number[][]>;
}

/** OpenAI embedder using text-embedding-3-small */
export class OpenAIEmbedder implements Embedder {
  constructor(private readonly apiKey: string) {}

  async embed(texts: string[]): Promise<number[][]> {
    void texts;
    throw new Error('Not implemented');
  }
}
