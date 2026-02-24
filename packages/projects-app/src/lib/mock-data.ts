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
