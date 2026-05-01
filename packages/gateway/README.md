# @ank1015/llm-gateway

Thin Hono gateway that keeps provider API keys server-side and proxies `@ank1015/llm-core` chat streaming and image generation over HTTP.

## What You Get

- `POST /v1/llm/stream` for raw `BaseAssistantEvent` SSE proxying
- `POST /v1/image/generate` for normalized `BaseImageResult` JSON responses
- access-token + refresh-token auth for callers
- optional admin username/password login and a built-in admin dashboard
- username/password user login for approved senders
- sender attribution on every request
- SQLite persistence for sanitized request input/output, event history, usage, and cost
- encrypted provider-key storage with in-memory cache

The v1 gateway intentionally stays simple and supports the providers whose upstream calls can be satisfied with a single stored API key. Provider-specific multi-secret flows stay out of this package.

## Installation

```bash
pnpm add @ank1015/llm-gateway
```

## Quick Start

Set the required environment:

```bash
export GATEWAY_JWT_SECRET=dev-secret
export GATEWAY_ENCRYPTION_KEY=$(openssl rand -base64 32)
export GATEWAY_ADMIN_TOKEN=dev-admin-token
export GATEWAY_ADMIN_USERNAME=admin
export GATEWAY_ADMIN_PASSWORD=change-me-before-real-use
```

Start the server:

```bash
pnpm --filter @ank1015/llm-gateway start
```

Then open `http://127.0.0.1:8123/admin/login`, sign in as the admin, store provider keys, and create users. A user can call `POST /v1/auth/login` with their username/password to receive access and refresh tokens.

The bearer admin token remains available for scripts and the CLI. It is the only non-browser caller allowed to create senders, issue token pairs directly, store provider keys, and inspect logs.

## Public Surface

- `createGatewayApp(config?)`
- `createGatewayServer(config?)`
- `getGatewayConfig()`
- `@ank1015/llm-gateway/contracts`
- `@ank1015/llm-gateway/server`

## Docs

- [docs/setup.md](./docs/setup.md) - config, bootstrap, and admin setup
- [docs/protocol.md](./docs/protocol.md) - chat/image request and response shapes
- [docs/auth.md](./docs/auth.md) - access tokens, refresh rotation, and admin auth
