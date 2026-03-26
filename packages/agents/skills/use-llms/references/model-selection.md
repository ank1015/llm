# Model Selection

## Supported Model IDs

- `gpt-5.4`
  - default choice for higher-capability reasoning and coding tasks
- `gpt-5.4-mini`
  - faster and lighter choice for simpler tasks or tighter iteration loops

## Default Rule

Prefer `gpt-5.4` unless the task is lightweight enough that lower latency matters more than extra reasoning depth.

## Important Notes

- If the user explicitly names one of the supported model IDs, use that model.
- `thinkingLevel` is chosen separately in `streamLlm()` or `createManagedConversation()`.
- If the task needs something outside this small built-in map, this skill is probably not the right fit.
