# Bundled Skills API

## `GET /api/skills`

List bundled installable skills exposed through `@ank1015/llm-agents`.

Responses:

- `200` — array of bundled skill entries
- `500` — failed to list bundled skills

Current bundled skill set is defined by the agents package, not by the server package.
