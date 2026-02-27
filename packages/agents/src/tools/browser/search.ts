import { Type } from '@sinclair/typebox';
import Parallel from 'parallel-web';

import type { AgentTool } from '@ank1015/llm-sdk';

export function createParallelClient(): Parallel {
  const apiKey = process.env.PARALLEL_API_KEY;
  if (!apiKey) {
    throw new Error('Parallel API key is required. Set the PARALLEL_API_KEY environment variable.');
  }
  return new Parallel({ apiKey });
}

const searchSchema = Type.Object({
  objective: Type.String({
    description: 'A small one line description of the objective of the search',
  }),
  queries: Type.Array(Type.String({ description: 'An array of 2-3 words search queries' })),
  after_date: Type.Optional(
    Type.String({
      pattern: '^\\d{4}-\\d{2}-\\d{2}$',
      description: 'Optional date filter in YYYY-MM-DD format (example: 2026-01-31)',
    })
  ),
});

export const searchTool: AgentTool<typeof searchSchema> = {
  name: 'search',
  label: 'search',
  description:
    'Returns 10 web search results based on objective and search queries. Each search contains the url and excerpts from the url based on the objective.',
  parameters: searchSchema,
  execute: async (
    _toolCallId: string,
    {
      objective,
      queries,
      after_date,
    }: {
      objective: string;
      queries: string[];
      after_date?: string;
    }
  ) => {
    const client = createParallelClient();
    const trimmedAfterDate = after_date?.trim();

    const search = await client.beta.search({
      objective,
      search_queries: queries,
      max_results: 10,
      mode: 'agentic',
      ...(trimmedAfterDate ? { source_policy: { after_date: trimmedAfterDate } } : {}),
      excerpts: {
        max_chars_per_result: 1500,
      },
    });

    const formattedResults: string[] = [];

    formattedResults.push(`Search Results for: ${objective}`);
    formattedResults.push(`Queries: ${queries.join(', ')}`);
    formattedResults.push(`\nFound ${search.results.length} results:\n`);
    formattedResults.push('='.repeat(80));

    const urls = [];

    for (let i = 0; i < search.results.length; i++) {
      const result = search.results[i];
      urls.push(result!.url);
      formattedResults.push(`\n${i + 1}. ${result!.title}`);
      formattedResults.push(`   URL: ${result!.url}`);

      if (result!.publish_date) {
        formattedResults.push(`   Published: ${result!.publish_date}`);
      }

      if (result!.excerpts && result!.excerpts.length > 0) {
        formattedResults.push('   Excerpts:');
        for (const excerpt of result!.excerpts) {
          const cleaned = excerpt.trim().replace(/\s+/g, ' ');
          const truncated = cleaned.length > 500 ? cleaned.substring(0, 500) + '...' : cleaned;
          formattedResults.push(`   - ${truncated}`);
        }
      }

      formattedResults.push('');
    }

    const content = formattedResults.join('\n');

    return {
      content: [{ type: 'text', content }],
      details: {
        search_id: search.search_id,
        result_count: search.results.length,
        urls: urls,
      },
    };
  },
};
