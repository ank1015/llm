# Providers

`@ank1015/llm-core` currently ships 11 built-in providers.

## Provider matrix

| Provider    | API           | Auth / required options                   | Runtime family          | Shared engine |
| ----------- | ------------- | ----------------------------------------- | ----------------------- | ------------- |
| Anthropic   | `anthropic`   | `apiKey`                                  | Native SDK              | No            |
| Claude Code | `claude-code` | `oauthToken`, `betaFlag`, `billingHeader` | Anthropic-style proxy   | No            |
| OpenAI      | `openai`      | `apiKey`                                  | Native SDK              | No            |
| Codex       | `codex`       | `apiKey`, `chatgpt-account-id`            | OpenAI Responses proxy  | No            |
| Google      | `google`      | `apiKey`                                  | Native SDK              | No            |
| DeepSeek    | `deepseek`    | `apiKey`                                  | OpenAI chat-completions | Yes           |
| Kimi        | `kimi`        | `apiKey`                                  | OpenAI chat-completions | Yes           |
| Z.AI        | `zai`         | `apiKey`                                  | OpenAI chat-completions | Yes           |
| Cerebras    | `cerebras`    | `apiKey`                                  | OpenAI chat-completions | Yes           |
| OpenRouter  | `openrouter`  | `apiKey`                                  | OpenAI chat-completions | Yes           |
| MiniMax     | `minimax`     | `apiKey`                                  | Anthropic-wire          | No            |

## Option differences worth remembering

- `openai` and `codex` are not interchangeable. Both use the OpenAI SDK, but `openai` uses the Responses API directly while `codex` adds backend-specific auth and request constraints.
- `codex` rejects caller-owned values for `stream`, `store`, `max_output_tokens`, `temperature`, `top_p`, and `truncation` at the type level.
- `claude-code` uses `oauthToken`, `betaFlag`, and `billingHeader` instead of a plain API key.
- `minimax` follows Anthropic-style request shapes and system prompt semantics.
- `kimi` supports a `thinking` config in provider options.
- `zai` supports a `thinking` config with optional `clear_thinking`.
- `cerebras` supports reasoning controls such as `reasoning_format`, `reasoning_effort`, and `disable_reasoning`.
- `openrouter` model IDs are router-style strings such as `provider/model-name`.

## Shared-engine breakdown

### Uses `providers/utils/chat-stream.ts`

- `deepseek`
- `kimi`
- `zai`
- `cerebras`
- `openrouter`

These providers share the same chunk-processing engine and differ mainly in:

- base URL
- request param shaping
- usage/cache-token extraction
- provider-specific option fields

### Custom stream implementations

- `anthropic`
- `claude-code`
- `minimax`
- `openai`
- `codex`
- `google`

These keep custom stream logic because the provider event models are materially different or because the transport/auth behavior is not compatible with the shared chat-completions path.

## Model catalog notes

- Most providers define models in a small hand-maintained file under `src/models/<provider>.ts`.
- `openrouter` is special: its model catalog is refreshed with `scripts/update-openrouter-models.mjs`.
- The assembled catalog lives in `src/models/index.ts`.
