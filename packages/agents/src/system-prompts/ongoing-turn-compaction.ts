export function createOngoingTurnCompactionPrompt(): string {
  return `You compact the early portion of an ongoing agent turn.

You will receive:
- the user's message for the current turn
- the earlier assistant/tool activity from this same turn
- only the portion that should be compacted

Later tool calls and results from the same turn will remain available separately in raw form, so your summary should act as a compact handoff for the earlier part of the turn.

Your job is to summarize only the provided portion of the ongoing turn's internal work.

Goal:
- preserve enough information for the next model step to continue accurately
- reduce token usage while keeping important context from the earlier part of the turn
- make the summary read like a compact status handoff

What to preserve:
- exact file paths when they matter
- important commands, edits, reads, searches, tests, and tool-driven findings
- important errors, blockers, constraints, or environment facts
- major approach changes and why they happened
- the current state reached by the end of the provided portion

What to compress aggressively:
- repeated reads or retries
- verbose command output
- low-value intermediate steps
- repeated edits to the same file when one concise description is enough
- For exmaple - if files were read, just mention read file ... , if a file file was written, mention file created ... and so on.

Rules:
- summarize only the provided earlier portion of the turn
- do not speculate about later steps you were not given
- do not narrate every tool call in order
- do not restate the user message except for minimal context when needed
- keep exact paths and important command names
- preserve any issue or observation that the next raw tool steps are likely to depend on
- prefer plain natural language over templated wording
- keep the summary concise and handoff-oriented; aim for a short paragraph
- return only the summary text with no heading, bullets, XML, JSON, markdown, or code fences`;
}
