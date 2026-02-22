export type MockThread = {
  threadId: string;
  threadName: string;
  age: string;
};

export type MockBranch = {
  branchId: string;
  branchName: string;
  status: 'active' | 'merged';
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
        threads: [
          { threadId: '1', threadName: 'Review high-level strategy for Q2', age: '3d' },
          { threadId: '2', threadName: 'Review polymarket strategy docs', age: '3d' },
        ],
      },
      {
        branchId: 'b2',
        branchName: 'feat/market-analytics',
        status: 'active',
        threads: [{ threadId: '3', threadName: 'Estimate storage and compute costs', age: '3d' }],
      },
      {
        branchId: 'b3',
        branchName: 'fix/order-matching',
        status: 'merged',
        threads: [{ threadId: '4', threadName: 'Debug order matching race condition', age: '7d' }],
      },
      {
        branchId: 'b4',
        branchName: 'feat/onboarding-flow',
        status: 'merged',
        threads: [{ threadId: '5', threadName: 'Design onboarding screens', age: '12d' }],
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
        threads: [{ threadId: '6', threadName: 'PDF text extraction pipeline', age: '1d' }],
      },
    ],
  },
  {
    projectId: 'p3',
    projectName: 'llm',
    branches: [],
  },
];
