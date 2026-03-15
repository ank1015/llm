# Configuration

## Canonical env var

Use:

```bash
EXPO_PUBLIC_LLM_SERVER_BASE_URL=http://localhost:8001
```

Create a local `.env.local` from [`.env.example`](../.env.example).

## Compatibility

`EXPO_PUBLIC_LLM_SERVER_URL` is still accepted temporarily for local compatibility, but new
setups should use `EXPO_PUBLIC_LLM_SERVER_BASE_URL`.

## Fallback order

`src/lib/client-api/http.ts` resolves the server base URL in this order:

1. `EXPO_PUBLIC_LLM_SERVER_BASE_URL`
2. `EXPO_PUBLIC_LLM_SERVER_URL`
3. Expo/native host inference
4. platform-specific localhost fallback

`app.json` must not contain a committed personal server URL.
