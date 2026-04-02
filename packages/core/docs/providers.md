# Provider Notes

`@ank1015/llm-core` is stateless. Provider credentials are passed in request options rather than resolved from process state inside the package.

## Built-In Providers

| Provider    | `getModel()` API key | Typical integration-test env                                        |
| ----------- | -------------------- | ------------------------------------------------------------------- |
| OpenAI      | `openai`             | `OPENAI_API_KEY`                                                    |
| Codex       | `codex`              | `~/.codex/auth.json` or explicit `apiKey` plus `chatgpt-account-id` |
| Google      | `google`             | `GEMINI_API_KEY`                                                    |
| DeepSeek    | `deepseek`           | `DEEPSEEK_API_KEY`                                                  |
| Anthropic   | `anthropic`          | `ANTHROPIC_API_KEY`                                                 |
| Claude Code | `claude-code`        | explicit `oauthToken`, `betaFlag`, `billingHeader`                  |
| Z.AI        | `zai`                | `ZAI_API_KEY`                                                       |
| Kimi        | `kimi`               | `KIMI_API_KEY`                                                      |
| MiniMax     | `minimax`            | `MINIMAX_API_KEY`                                                   |
| Cerebras    | `cerebras`           | `CEREBRAS_API_KEY`                                                  |
| OpenRouter  | `openrouter`         | `OPENROUTER_API_KEY`                                                |

## Provider Options

All built-in providers expose typed option aliases through the package root, for example:

- `OpenAIProviderOptions`
- `GoogleProviderOptions`
- `AnthropicProviderOptions`
- `CodexProviderOptions`
- `CerebrasProviderOptions`
- `KimiProviderOptions`
- `ZaiProviderOptions`

These types preserve the upstream SDK request shape while omitting fields managed by core, such as model selection and normalized message input assembly.

## Notes

- `stream()` and `complete()` expect provider-specific options for the selected model.
- File inputs are passed as base64 content blocks in user messages or tool results.
- Several providers support reasoning or thinking output, which core normalizes into `thinking_*` events and `thinking` content blocks.
- Codex integration tests read access tokens from `~/.codex/auth.json` and pass both `apiKey` and `chatgpt-account-id`.
- Claude Code requires explicit OAuth-style request fields rather than a single API key.
