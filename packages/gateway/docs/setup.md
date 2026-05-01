# Setup

Required environment variables:

- `GATEWAY_JWT_SECRET`
- `GATEWAY_ENCRYPTION_KEY` - base64 encoded 32-byte AES key
- `GATEWAY_ADMIN_TOKEN`

Optional environment variables:

- `GATEWAY_ADMIN_USERNAME` - enables browser admin login when paired with `GATEWAY_ADMIN_PASSWORD`
- `GATEWAY_ADMIN_PASSWORD` - enables browser admin login when paired with `GATEWAY_ADMIN_USERNAME`
- `GATEWAY_HOST` - default `127.0.0.1`
- `GATEWAY_PORT` - default `8123`
- `GATEWAY_DB_PATH` - default `./gateway.sqlite`
- `GATEWAY_ACCESS_TTL_SECONDS` - default `900`
- `GATEWAY_REFRESH_TTL_SECONDS` - default `2592000`
- `GATEWAY_CORS_ORIGINS` - comma-separated, default `*`
- `GATEWAY_LOG_MODE` - `off`, `summary`, or `full`; default `full`
- `GATEWAY_RATE_LIMIT_ENABLED` - `true` or `false`; default `true`
- `GATEWAY_RATE_LIMIT_WINDOW_SECONDS` - unauthenticated non-login window; default `60`
- `GATEWAY_RATE_LIMIT_MAX` - unauthenticated non-login requests per window; default `60`
- `GATEWAY_LOGIN_RATE_LIMIT_WINDOW_SECONDS` - login window; default `600`
- `GATEWAY_LOGIN_RATE_LIMIT_MAX` - login attempts per window; default `10`
- `GATEWAY_TRUST_PROXY` - trust `X-Forwarded-*` headers from your reverse proxy; default `false`
- `GATEWAY_COOKIE_SECURE` - `auto`, `true`, or `false`; default `auto`

For production, set `GATEWAY_CORS_ORIGINS` to the exact browser origin that will call
the gateway. Do not leave it as `*` for a public deployment.

If the gateway is served over plain HTTP, browser cookies cannot use the `Secure`
attribute. For AWS/Azure MVPs, prefer keeping the gateway on a private interface
or behind an HTTPS reverse proxy. When using an HTTPS reverse proxy, set
`GATEWAY_TRUST_PROXY=true` so `GATEWAY_COOKIE_SECURE=auto` can honor
`X-Forwarded-Proto: https`.

Boot the server with:

```bash
pnpm --filter @ank1015/llm-gateway start
```

Typical first-run flow:

1. Set `GATEWAY_ADMIN_USERNAME` and `GATEWAY_ADMIN_PASSWORD`.
2. Open `/admin/login` and sign in.
3. Store provider keys from the dashboard.
4. Create users from the dashboard.
5. Users call `POST /v1/auth/login` with username/password to receive tokens.
6. Use the access token for `/v1/llm/stream` and `/v1/image/generate`.
7. Use the refresh token with `/v1/auth/refresh` to rotate credentials.

Scripted admin flow:

1. Send `Authorization: Bearer <GATEWAY_ADMIN_TOKEN>`.
2. Call `PUT /admin/providers/:api/key` for provider keys.
3. Call `POST /admin/senders` with `name`, optional `username`, and optional `password`.
4. Call `POST /admin/senders/:id/tokens` only when you want to mint a pair directly instead of using user login.
