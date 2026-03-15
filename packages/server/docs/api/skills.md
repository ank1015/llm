# Bundled Skills API

## `GET /api/skills`

List bundled installable skills exposed through `@ank1015/llm-agents`.

Responses:

- `200` — array of `BundledSkillDto`
- `500` — failed to list bundled skills

Current bundled skill set is defined by the agents package, not by the server package.

`BundledSkillDto` only exposes:

```json
{
  "name": "ai-images",
  "description": "Create brand-new images or edit existing images with state-of-the-art image generation models.",
  "helperProject": {
    "runtime": "typescript",
    "package": "@ank1015/llm-agents"
  }
}
```

Notes:

- bundled skill DTOs do not expose source directories or local filesystem paths
- `helperProject` indicates that installing the skill prepares `.max/temp` for helper-backed scripts
