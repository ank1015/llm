import { Type } from '@sinclair/typebox';

import type { AgentTool } from '@ank1015/llm-sdk';

import { createParallelClient } from '@/lib/api/web';

const searchSchema = Type.Object({
  objective: Type.String({
    description: 'A small one line description of the objective of the search',
  }),
  queries: Type.Array(Type.String({ description: 'An array of 2-3 words search queries' })),
});

export const searchTool: AgentTool<typeof searchSchema> = {
  name: 'search',
  label: 'search',
  description:
    'Returns 6 web search results based on objective and search queries. Each search contains the url and excerpts from the url based on the objective.',
  parameters: searchSchema,
  execute: async (
    _toolCallId: string,
    { objective, queries }: { objective: string; queries: string[] }
  ) => {
    const client = createParallelClient();

    const search = await client.beta.search({
      objective,
      search_queries: queries,
      max_results: 6,
      mode: 'agentic',
      excerpts: {
        max_chars_per_result: 6000,
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
      urls.push(result.url);
      formattedResults.push(`\n${i + 1}. ${result.title}`);
      formattedResults.push(`   URL: ${result.url}`);

      if (result.publish_date) {
        formattedResults.push(`   Published: ${result.publish_date}`);
      }

      if (result.excerpts && result.excerpts.length > 0) {
        formattedResults.push('   Excerpts:');
        for (const excerpt of result.excerpts) {
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
