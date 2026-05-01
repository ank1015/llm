# Auth

## Access Tokens

- Bearer JWTs signed with `GATEWAY_JWT_SECRET`
- short-lived
- include the sender id as the token subject

Users receive access tokens by calling:

```http
POST /v1/auth/login
Content-Type: application/json

{ "username": "tester", "password": "tester-password" }
```

There is no public signup route. A user must be created by an admin first.

## Refresh Tokens

- opaque random tokens
- stored only as SHA-256 hashes in SQLite
- rotated on every successful refresh
- revoked immediately on refresh reuse or explicit revoke

## Admin Auth

The JSON admin API is protected separately with:

```http
Authorization: Bearer <GATEWAY_ADMIN_TOKEN>
```

Admin auth is not tied to senders and never uses refresh tokens.

The browser dashboard uses `GATEWAY_ADMIN_USERNAME` and `GATEWAY_ADMIN_PASSWORD`:

```text
GET /admin/login
GET /admin/dashboard
```

After a successful admin login, the gateway sets an HttpOnly dashboard session cookie scoped to `/admin`. The dashboard can create users and store provider keys without exposing provider keys back to the browser.

Dashboard cookies use `Secure` when `GATEWAY_COOKIE_SECURE=true`, or when
`GATEWAY_COOKIE_SECURE=auto` and the request is HTTPS. If the gateway is behind
an HTTPS reverse proxy, set `GATEWAY_TRUST_PROXY=true` so the gateway can use
`X-Forwarded-Proto: https` to enable secure cookies.

Public login, refresh, revoke, invalid admin bearer-token, and unauthenticated
LLM/image requests are rate limited to slow repeated unknown callers. Successful
authenticated LLM/image usage is not rate limited by the gateway MVP limiter.
