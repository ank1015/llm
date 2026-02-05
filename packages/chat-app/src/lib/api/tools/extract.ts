import { Type } from '@sinclair/typebox';

import type { AgentTool } from '@ank1015/llm-sdk';

import { createFirecrawlClient } from '@/lib/api/web';

const extractSchema = Type.Object({
  url: Type.String({ description: 'The url to get data from.' }),
});

export const extractTool: AgentTool<typeof extractSchema> = {
  name: 'extract',
  label: 'extract',
  description: 'Get the full page content from a URL as markdown',
  parameters: extractSchema,

  execute: async (_toolCallId: string, { url }: { url: string }) => {
    const client = createFirecrawlClient();
    const doc = await client.scrape(url, { formats: ['markdown'] });

    const formattedResults: string[] = [];

    formattedResults.push(`Content extracted from: ${url}\n`);
    formattedResults.push('='.repeat(80));

    if (doc.metadata?.title) {
      formattedResults.push(`\nTitle: ${doc.metadata.title}`);
    }

    if (doc.metadata?.description) {
      formattedResults.push(`Description: ${doc.metadata.description}`);
    }

    if (doc.metadata?.keywords) {
      formattedResults.push(`Keywords: ${doc.metadata.keywords}`);
    }

    formattedResults.push('\n' + '='.repeat(80));
    formattedResults.push('\nMarkdown Content:\n');

    if (doc.markdown) {
      formattedResults.push(doc.markdown);
    } else {
      formattedResults.push('(No markdown content available)');
    }

    const content = formattedResults.join('\n');

    return {
      content: [{ type: 'text', content }],
      details: {
        metadata: doc.metadata,
        status_code: doc.metadata?.statusCode,
      },
    };
  },
};
