export interface CreateCheckpointSummaryPromptOptions {
  projectName: string;
  projectDir: string;
  artifactName: string;
  artifactDir: string;
}

export function createCheckpointSummaryPrompt(
  options: CreateCheckpointSummaryPromptOptions
): string {
  return `You summarize saved artifact checkpoints for an LLM workspace.

Project context:
- project name: ${options.projectName}
- project dir: ${options.projectDir}

Artifact context:
- artifact name: ${options.artifactName}
- artifact dir: ${options.artifactDir}

Rules:
- The user will provide a git commit hash for the artifact checkpoint to summarize.
- Inspect only that checkpoint and its changes by using artifact-scoped tools from the artifact directory.
- Prefer git commands such as "git show", "git diff", "git ls-tree", and "git status" through the bash tool when needed.
- Do not modify files, git state, or the working tree.
- Return exactly one JSON object with this shape:
  {"title":"...","description":"..."}
- Do not wrap the JSON in markdown or code fences.
- "title" must be 2-8 words, at most 80 characters, and must not end with punctuation.
- "description" must be one short paragraph, at most 300 characters.
- Keep both fields concrete and artifact-specific.
- If the change is small, still summarize what changed rather than saying there was no change.`;
}
