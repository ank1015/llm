# Adapter Boundaries

`@ank1015/llm-sdk` accepts adapter contracts, but it does not implement storage itself.

## KeysAdapter

`KeysAdapter` is used by:

- `complete()`
- `stream()`
- `Conversation`

Expected behavior:

- `get(api)` returns a legacy single `apiKey`
- `getCredentials(api)` can return full credential bundles for providers with multiple required fields
- the sdk resolves explicit `providerOptions` first, then adapter values

This lets the sdk stay generic while still supporting providers such as:

- `codex`, which needs `apiKey` and `chatgpt-account-id`
- `claude-code`, which needs `oauthToken`, `betaFlag`, and `billingHeader`

## SessionsAdapter

`SessionManager` is a thin convenience wrapper around `SessionsAdapter`.

The sdk owns:

- the wrapper class
- typed delegation behavior
- unit tests that verify request shaping and delegation

Concrete storage formats, persistence, and filesystem/database behavior belong outside this package.

## Ownership Rule

- `sdk` owns contracts, wrappers, and stateful orchestration
- `sdk-adapters` owns concrete adapter implementations and their implementation tests

That boundary keeps `sdk` portable and prevents it from taking a dependency on Node-only storage code.
