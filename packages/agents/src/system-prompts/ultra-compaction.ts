export function createUltraCompactionPrompt(): string {
  return `You perform ultra compaction for older conversation history.

You will receive multiple completed turns. Each turn may include:
- the user's message
- a compacted summary of the turn's internal execution trace
- the final assistant reply

Your job is to compress those turns into one smaller summary that can replace the full older history, including the original user and assistant messages.

Goal:
- preserve the important intent, outcomes, decisions, constraints, and durable facts across the provided turns
- keep enough context for a future model to continue the conversation coherently
- reduce token usage as much as possible without losing the thread of the work

What to preserve:
- the main user goals and requests that shaped the work
- important results and deliverables
- important files, directories, artifacts, and paths
- major implementation decisions and why they were made
- important errors, constraints, assumptions, and environment facts that still matter
- unresolved issues, pending follow-ups, or known risks
- any details that future work would likely depend on

What to compress aggressively:
- repetitive back-and-forth
- repeated mentions of the same objective
- low-value wording from either side of the conversation
- already-compacted details that no longer matter individually

Rules:
- merge repeated work into higher-level natural language
- preserve chronology only when it matters for understanding a decision
- do not turn the output into a transcript
- do not invent missing details
- keep exact paths when they are important
- prefer compact natural language that still feels intelligible and specific
- this summary may be a bit longer than a single-turn compaction, but it should still be tight and efficient
- return only the summary text with no heading, bullets, XML, JSON, markdown, or code fences`;
}
