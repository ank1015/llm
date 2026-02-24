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

export type Thread = {
  id: string;
  name: string;
  age: string;
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
      { id: 't1', name: 'Add OAuth2 flow', age: '2d' },
      { id: 't2', name: 'Fix token refresh', age: '5d' },
      { id: 't3', name: 'Add rate limiting', age: '1w' },
    ],
  },
  {
    id: 'a2',
    name: 'dashboard-ui',
    threads: [
      { id: 't4', name: 'Redesign chart component', age: '1d' },
      { id: 't5', name: 'Add dark mode support', age: '3d' },
    ],
  },
  {
    id: 'a3',
    name: 'api-gateway',
    threads: [
      { id: 't6', name: 'Implement caching layer', age: '4d' },
      { id: 't7', name: 'Add request validation', age: '6d' },
      { id: 't8', name: 'Setup logging pipeline', age: '2w' },
    ],
  },
  {
    id: 'a4',
    name: 'data-pipeline',
    threads: [
      { id: 't9', name: 'ETL job scheduling', age: '3d' },
      { id: 't10', name: 'Add S3 sink connector', age: '1w' },
    ],
  },
];
