/** Convert branch name to URL-safe slug: `feat/trading-engine` → `feat-trading-engine` */
export function branchToSlug(branchName: string): string {
  return branchName.replace(/\//g, '-');
}

/** Find a branch by its URL slug within a project */
export function findBranchBySlug(project: MockProject, slug: string): MockBranch | undefined {
  return project.branches.find((b) => branchToSlug(b.branchName) === slug);
}

export type MockMessage = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
};

export type MockThread = {
  threadId: string;
  threadName: string;
  age: string;
  messages: MockMessage[];
};

export type MockBranch = {
  branchId: string;
  branchName: string;
  status: 'active' | 'merged';
  description: string;
  threads: MockThread[];
};

export type MockProject = {
  projectId: string;
  projectName: string;
  branches: MockBranch[];
};

export const MOCK_PROJECTS: MockProject[] = [
  {
    projectId: 'p1',
    projectName: 'polymarket',
    branches: [
      {
        branchId: 'b1',
        branchName: 'feat/trading-engine',
        status: 'active',
        description:
          'Implementing the core trading engine for prediction markets. This includes order matching, position management, liquidity pooling, and real-time price feeds. The engine supports both limit and market orders with configurable slippage tolerance.',
        threads: [
          {
            threadId: '1',
            threadName: 'Review high-level strategy for Q2',
            age: '3d',
            messages: [
              {
                id: 'm1',
                role: 'user',
                content:
                  'Can you review the high-level trading strategy we have planned for Q2? I want to make sure we are covering all the key markets.',
                timestamp: '2:30 PM',
              },
              {
                id: 'm2',
                role: 'assistant',
                content:
                  "I've reviewed the Q2 trading strategy document. Here are my key observations:\n\n**Strengths:**\n- Good diversification across political and sports markets\n- The risk management limits are well-defined\n- Liquidity targets are realistic given current volumes\n\n**Areas for improvement:**\n- The strategy underweights crypto-related markets, which have been growing 40% quarter-over-quarter\n- No contingency plan for high-volatility events like surprise elections\n- The target ROI of 15% seems conservative given Q1 performance\n\nWould you like me to draft specific recommendations for any of these areas?",
                timestamp: '2:31 PM',
              },
              {
                id: 'm3',
                role: 'user',
                content: 'Good points. Can you elaborate on the crypto market opportunity?',
                timestamp: '2:35 PM',
              },
              {
                id: 'm4',
                role: 'assistant',
                content:
                  "The crypto-related prediction markets have seen significant growth recently. A few key data points:\n\n1. **Volume growth**: Crypto markets on Polymarket saw $2.3B in volume in Q1, up from $1.6B in Q4\n2. **Market diversity**: New categories like DeFi protocol outcomes and L2 adoption metrics are attracting institutional traders\n3. **Margin opportunity**: Spreads on crypto markets tend to be wider (3-5%) compared to political markets (1-2%), offering better margin potential\n\nI'd recommend allocating at least 20% of the Q2 portfolio to crypto-adjacent markets, up from the current 8% allocation.",
                timestamp: '2:36 PM',
              },
            ],
          },
          {
            threadId: '2',
            threadName: 'Review polymarket strategy docs',
            age: '3d',
            messages: [
              {
                id: 'm5',
                role: 'user',
                content:
                  'Please review the strategy docs in the shared drive and summarize the key takeaways.',
                timestamp: '10:00 AM',
              },
              {
                id: 'm6',
                role: 'assistant',
                content:
                  "I've reviewed the strategy documents. Here's a summary of the key takeaways:\n\n- **Market selection criteria** have been tightened to focus on markets with >$100K daily volume\n- **Position sizing** is now based on a Kelly criterion variant with a 0.5x fractional multiplier\n- **Exit strategies** include both time-based and threshold-based triggers\n\nThe documents are well-structured overall. Let me know if you want me to deep-dive into any section.",
                timestamp: '10:02 AM',
              },
            ],
          },
        ],
      },
      {
        branchId: 'b2',
        branchName: 'feat/market-analytics',
        status: 'active',
        description:
          'Building an analytics dashboard for market performance tracking. Includes volume trends, user activity heatmaps, P&L breakdowns by market category, and automated report generation for weekly stakeholder updates.',
        threads: [
          {
            threadId: '3',
            threadName: 'Estimate storage and compute costs',
            age: '3d',
            messages: [
              {
                id: 'm7',
                role: 'user',
                content:
                  'We need to estimate the storage and compute costs for running the analytics pipeline on AWS. We process about 50M events per day.',
                timestamp: '4:15 PM',
              },
              {
                id: 'm8',
                role: 'assistant',
                content:
                  "Based on 50M events/day, here's a rough cost estimate:\n\n**Storage (S3 + DynamoDB)**\n- Raw event storage: ~150GB/day → ~$100/mo for S3\n- DynamoDB for hot data: ~$250/mo with on-demand pricing\n- Total storage: **~$350/mo**\n\n**Compute (Lambda + ECS)**\n- Event processing Lambda: ~$180/mo at 50M invocations\n- Analytics ECS tasks (3x m5.xlarge): ~$460/mo\n- Total compute: **~$640/mo**\n\n**Other**\n- Data transfer: ~$90/mo\n- CloudWatch logging: ~$50/mo\n\n**Estimated monthly total: ~$1,130/mo**\n\nThis could be optimized with reserved instances and S3 lifecycle policies. Want me to detail the optimization opportunities?",
                timestamp: '4:17 PM',
              },
            ],
          },
        ],
      },
      {
        branchId: 'b3',
        branchName: 'fix/order-matching',
        status: 'merged',
        description:
          'Fixed a race condition in the order matching engine where concurrent processes could match the same order twice. Added optimistic locking with a version column and idempotency keys on match operations.',
        threads: [
          {
            threadId: '4',
            threadName: 'Debug order matching race condition',
            age: '7d',
            messages: [
              {
                id: 'm9',
                role: 'user',
                content:
                  'We are seeing intermittent failures in the order matching engine. Orders occasionally get matched twice. Can you help debug this?',
                timestamp: '11:00 AM',
              },
              {
                id: 'm10',
                role: 'assistant',
                content:
                  "This sounds like a classic race condition. The double-matching likely happens when two concurrent processes read the same order state before either writes the match result.\n\nTo fix this, I'd suggest:\n1. Add an optimistic locking mechanism using a version column\n2. Use a database-level advisory lock during the matching window\n3. Implement idempotency keys on match operations\n\nThe quickest fix is option 1. Should I draft the implementation?",
                timestamp: '11:02 AM',
              },
            ],
          },
        ],
      },
      {
        branchId: 'b4',
        branchName: 'feat/onboarding-flow',
        status: 'merged',
        description:
          'Designed and implemented a 3-step onboarding flow for new users covering account setup, wallet funding, and a guided first trade. Includes progress indicators and skip options to keep completion under 2 minutes.',
        threads: [
          {
            threadId: '5',
            threadName: 'Design onboarding screens',
            age: '12d',
            messages: [
              {
                id: 'm11',
                role: 'user',
                content:
                  'Help me design the onboarding flow for new users. We want to keep it under 3 steps.',
                timestamp: '9:00 AM',
              },
              {
                id: 'm12',
                role: 'assistant',
                content:
                  "Here's a 3-step onboarding flow:\n\n**Step 1: Welcome & Account Setup**\n- Display name and avatar selection\n- Quick preference survey (markets of interest)\n\n**Step 2: Fund Your Account**\n- Connect wallet or deposit USDC\n- Show current balance and minimum trade amounts\n\n**Step 3: Your First Trade**\n- Interactive tutorial with a guided first prediction\n- Explain how markets work with a real example\n\nEach step should have a progress indicator and a skip option. The whole flow should complete in under 2 minutes.",
                timestamp: '9:03 AM',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    projectId: 'p2',
    projectName: 'web-reader',
    branches: [
      {
        branchId: 'b5',
        branchName: 'feat/pdf-parser',
        status: 'active',
        description:
          'Building a PDF text extraction pipeline that handles both scanned and native PDFs. Uses pdf-parse for native text extraction and Tesseract.js for OCR on scanned documents, with post-processing for whitespace cleanup and language detection.',
        threads: [
          {
            threadId: '6',
            threadName: 'PDF text extraction pipeline',
            age: '1d',
            messages: [
              {
                id: 'm13',
                role: 'user',
                content:
                  'I need to build a PDF text extraction pipeline that handles both scanned and native PDFs. What approach do you recommend?',
                timestamp: '3:00 PM',
              },
              {
                id: 'm14',
                role: 'assistant',
                content:
                  'For a robust PDF extraction pipeline, I recommend a two-track approach:\n\n**Native PDFs** (text-based):\n- Use `pdf-parse` or `pdfjs-dist` to extract text directly\n- Preserves formatting and is very fast\n- Handle multi-column layouts with coordinate-based sorting\n\n**Scanned PDFs** (image-based):\n- First detect if PDF is scanned using text-layer presence check\n- Convert pages to images using `sharp` or `pdf2pic`\n- Run OCR with Tesseract.js or a cloud OCR API\n\n**Pipeline architecture:**\n1. PDF ingestion → classify (native vs scanned)\n2. Route to appropriate extraction path\n3. Post-process: clean whitespace, fix encoding, detect language\n4. Output structured text with page/position metadata\n\nShall I start with the native PDF extractor implementation?',
                timestamp: '3:03 PM',
              },
            ],
          },
        ],
      },
    ],
  },
  {
    projectId: 'p3',
    projectName: 'llm',
    branches: [],
  },
];
