import { describe, it, expect } from 'vitest';

import { OpenAIEmbedder, cosineSimilarity } from '../../../src/search/embedder.js';

const apiKey = process.env['OPENAI_API_KEY'];

describe.skipIf(!apiKey)('OpenAIEmbedder integration', () => {
  it('should return embeddings with correct dimensions', async () => {
    const embedder = new OpenAIEmbedder(apiKey!);
    const vectors = await embedder.embed(['Hello world']);

    expect(vectors).toHaveLength(1);
    // text-embedding-3-small produces 1536-dimensional vectors
    expect(vectors[0]).toHaveLength(1536);
  });

  it('should return one vector per input text', async () => {
    const embedder = new OpenAIEmbedder(apiKey!);
    const vectors = await embedder.embed(['first', 'second', 'third']);

    expect(vectors).toHaveLength(3);
    vectors.forEach((v) => expect(v).toHaveLength(1536));
  });

  it('should produce similar vectors for related texts', async () => {
    const embedder = new OpenAIEmbedder(apiKey!);
    const vectors = await embedder.embed([
      'machine learning and neural networks',
      'deep learning with artificial intelligence',
      'baking chocolate chip cookies recipe',
    ]);

    const mlToAi = cosineSimilarity(vectors[0]!, vectors[1]!);
    const mlToCookies = cosineSimilarity(vectors[0]!, vectors[2]!);

    // ML and AI should be more similar than ML and cookies
    expect(mlToAi).toBeGreaterThan(mlToCookies);
  });
});
