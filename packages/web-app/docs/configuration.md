# Configuration

## Server URL

The web app talks directly to `@ank1015/llm-server`.

- env var: `NEXT_PUBLIC_LLM_SERVER_BASE_URL`
- local fallback: `http://localhost:8001`

The value is normalized by trimming trailing slashes before request URLs are built.

## Local Development

Typical setup:

1. Start `@ank1015/llm-server`
2. Start the web app with `pnpm --filter @ank1015/llm-web-app dev`
3. Optionally set `NEXT_PUBLIC_LLM_SERVER_BASE_URL` if the server is not on the default local port
