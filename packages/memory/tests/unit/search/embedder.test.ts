import { describe, it, expect, vi } from 'vitest';

import { cosineSimilarity, OpenAIEmbedder } from '../../../src/search/embedder.js';

describe('cosineSimilarity', () => {
  it('should return 1 for identical normalized vectors', () => {
    const v = [0.6, 0.8]; // normalized: sqrt(0.36+0.64) = 1
    expect(cosineSimilarity(v, v)).toBeCloseTo(1.0);
  });

  it('should return 0 for orthogonal vectors', () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(0);
  });

  it('should return -1 for opposite normalized vectors', () => {
    const a = [1, 0];
    const b = [-1, 0];
    expect(cosineSimilarity(a, b)).toBeCloseTo(-1);
  });

  it('should compute dot product correctly for arbitrary vectors', () => {
    const a = [1, 2, 3];
    const b = [4, 5, 6];
    // dot = 1*4 + 2*5 + 3*6 = 4 + 10 + 18 = 32
    expect(cosineSimilarity(a, b)).toBe(32);
  });

  it('should handle empty vectors', () => {
    expect(cosineSimilarity([], [])).toBe(0);
  });
});

describe('OpenAIEmbedder', () => {
  it('should call OpenAI embeddings API and return vectors in input order', async () => {
    const mockEmbeddings = [
      [0.1, 0.2, 0.3],
      [0.4, 0.5, 0.6],
    ];

    const mockCreate = vi.fn().mockResolvedValue({
      data: [
        { index: 1, embedding: mockEmbeddings[1] },
        { index: 0, embedding: mockEmbeddings[0] },
      ],
      model: 'text-embedding-3-small',
      usage: { prompt_tokens: 10, total_tokens: 10 },
    });

    const embedder = new OpenAIEmbedder('test-key');
    // Replace the internal client's embeddings.create with our mock
    (
      embedder as unknown as { client: { embeddings: { create: typeof mockCreate } } }
    ).client.embeddings.create = mockCreate;

    const result = await embedder.embed(['hello', 'world']);

    expect(mockCreate).toHaveBeenCalledWith({
      model: 'text-embedding-3-small',
      input: ['hello', 'world'],
      encoding_format: 'float',
    });
    // Should be sorted by index, matching input order
    expect(result).toEqual(mockEmbeddings);
  });

  it('should return empty array for empty input', async () => {
    const embedder = new OpenAIEmbedder('test-key');
    const result = await embedder.embed([]);
    expect(result).toEqual([]);
  });
});
