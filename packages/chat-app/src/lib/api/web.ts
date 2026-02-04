import Firecrawl from '@mendable/firecrawl-js';
import Parallel from 'parallel-web';

export function createParallelClient(): Parallel {
  const apiKey = process.env.PARALLEL_API_KEY;
  if (!apiKey) {
    throw new Error('Parallel API key is required. Set the PARALLEL_API_KEY environment variable.');
  }
  return new Parallel({ apiKey });
}

export function createFirecrawlClient(): Firecrawl {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) {
    throw new Error(
      'Firecrawl API key is required. Set the FIRECRAWL_API_KEY environment variable.'
    );
  }
  return new Firecrawl({ apiKey });
}
