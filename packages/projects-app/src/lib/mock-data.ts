export type Project = {
  id: string;
  name: string;
  description: string;
};

export const mockProjects: Project[] = [
  { id: '1', name: 'polymarket', description: 'Prediction market platform' },
  { id: '2', name: 'web-reader', description: 'Browser-based reading app' },
  { id: '3', name: 'llm', description: 'LLM application monorepo' },
  { id: '4', name: 'personal-site', description: 'Portfolio and blog' },
  { id: '5', name: 'notes-app', description: 'Markdown note-taking tool' },
];

export type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
};

export type Thread = {
  id: string;
  name: string;
  age: string;
  messages: Message[];
};

export type Artifact = {
  id: string;
  name: string;
  threads: Thread[];
};

export const mockArtifacts: Artifact[] = [
  {
    id: 'a1',
    name: 'auth-service',
    threads: [
      {
        id: 't1',
        name: 'Add OAuth2 flow',
        age: '2d',
        messages: [
          {
            id: 'm1',
            role: 'user',
            content: 'Can you add OAuth2 support with Google and GitHub providers?',
          },
          {
            id: 'm2',
            role: 'assistant',
            content:
              "I'll set up OAuth2 with both Google and GitHub providers. I'll create the necessary routes, callback handlers, and token management.\n\nHere's the plan:\n1. Add passport strategies for Google and GitHub\n2. Create /auth/google and /auth/github routes\n3. Handle callbacks and token exchange\n4. Store refresh tokens securely",
          },
          { id: 'm3', role: 'user', content: 'Make sure to handle token refresh automatically.' },
          {
            id: 'm4',
            role: 'assistant',
            content:
              "I'll add automatic token refresh middleware that checks token expiry before each authenticated request. If the access token is expired, it will use the stored refresh token to get a new one transparently.",
          },
        ],
      },
      {
        id: 't2',
        name: 'Fix token refresh',
        age: '5d',
        messages: [
          {
            id: 'm5',
            role: 'user',
            content:
              'The token refresh is failing silently when the refresh token itself has expired.',
          },
          {
            id: 'm6',
            role: 'assistant',
            content:
              "I see the issue. When the refresh token expires, we need to catch that specific error and redirect the user to re-authenticate rather than silently failing. I'll add proper error handling for expired refresh tokens.",
          },
        ],
      },
      {
        id: 't3',
        name: 'Add rate limiting',
        age: '1w',
        messages: [
          {
            id: 'm7',
            role: 'user',
            content: 'We need rate limiting on the auth endpoints to prevent brute force attacks.',
          },
          {
            id: 'm8',
            role: 'assistant',
            content:
              "I'll implement rate limiting using a sliding window algorithm. For login endpoints, I'll set a limit of 5 attempts per minute per IP, with exponential backoff after repeated failures.",
          },
        ],
      },
    ],
  },
  {
    id: 'a2',
    name: 'dashboard-ui',
    threads: [
      {
        id: 't4',
        name: 'Redesign chart component',
        age: '1d',
        messages: [
          {
            id: 'm9',
            role: 'user',
            content:
              'The bar chart needs a complete redesign. It should support stacked bars and custom color themes.',
          },
          {
            id: 'm10',
            role: 'assistant',
            content:
              "I'll rebuild the chart component with support for stacked bars, custom color palettes, and smooth animations. The new component will use CSS custom properties for theming so it integrates with the existing design system.",
          },
        ],
      },
      {
        id: 't5',
        name: 'Add dark mode support',
        age: '3d',
        messages: [
          {
            id: 'm11',
            role: 'user',
            content: 'All dashboard components need to support dark mode.',
          },
          {
            id: 'm12',
            role: 'assistant',
            content:
              "I'll update the dashboard components to use CSS custom properties that automatically adapt to the current theme. Charts, tables, and cards will all respect the dark mode preference.",
          },
          { id: 'm13', role: 'user', content: "Don't forget the tooltip overlays." },
          {
            id: 'm14',
            role: 'assistant',
            content:
              "Good catch. I'll update the tooltip components as well — they need inverted colors in dark mode to maintain readability against the darker background.",
          },
        ],
      },
    ],
  },
  {
    id: 'a3',
    name: 'api-gateway',
    threads: [
      {
        id: 't6',
        name: 'Implement caching layer',
        age: '4d',
        messages: [
          {
            id: 'm15',
            role: 'user',
            content: 'Add a Redis-based caching layer for frequently accessed API responses.',
          },
          {
            id: 'm16',
            role: 'assistant',
            content:
              "I'll implement a caching middleware that uses Redis for storing API responses. It will support configurable TTLs per route, cache invalidation on mutations, and cache-control headers for client-side caching.",
          },
        ],
      },
      {
        id: 't7',
        name: 'Add request validation',
        age: '6d',
        messages: [
          {
            id: 'm17',
            role: 'user',
            content: 'We need Zod-based request validation on all endpoints.',
          },
          {
            id: 'm18',
            role: 'assistant',
            content:
              "I'll create a validation middleware that uses Zod schemas to validate request bodies, query parameters, and path parameters. Invalid requests will return structured error responses with field-level details.",
          },
        ],
      },
      {
        id: 't8',
        name: 'Setup logging pipeline',
        age: '2w',
        messages: [
          {
            id: 'm19',
            role: 'user',
            content: 'Set up structured logging that outputs JSON for our log aggregator.',
          },
          {
            id: 'm20',
            role: 'assistant',
            content:
              "I'll configure pino for structured JSON logging with request correlation IDs, automatic error serialization, and log level filtering per environment.",
          },
        ],
      },
    ],
  },
  {
    id: 'a4',
    name: 'data-pipeline',
    threads: [
      {
        id: 't9',
        name: 'ETL job scheduling',
        age: '3d',
        messages: [
          {
            id: 'm21',
            role: 'user',
            content: 'Create a job scheduler for running ETL pipelines on a cron schedule.',
          },
          {
            id: 'm22',
            role: 'assistant',
            content:
              "I'll build a job scheduler using node-cron with support for defining pipeline steps, retry logic, and progress tracking. Each job will have its own execution context and error handling.",
          },
        ],
      },
      {
        id: 't10',
        name: 'Add S3 sink connector',
        age: '1w',
        messages: [
          {
            id: 'm23',
            role: 'user',
            content: 'We need to write processed data to S3 in Parquet format.',
          },
          {
            id: 'm24',
            role: 'assistant',
            content:
              "I'll create an S3 sink connector that buffers records, converts them to Parquet format, and uploads to S3 with configurable partitioning by date or custom keys.",
          },
        ],
      },
    ],
  },
];

export function findThread(artifactName: string, threadId: string): Thread | undefined {
  const artifact = mockArtifacts.find((a) => a.name === artifactName);
  return artifact?.threads.find((t) => t.id === threadId);
}
