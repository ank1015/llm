# Server Testing

The server package now has three test layers:

- `pnpm --filter @ank1015/llm-server test:unit`
- `pnpm --filter @ank1015/llm-server test:integration`
- `pnpm --filter @ank1015/llm-server test:live`

`test:live` is opt-in and expects Codex credentials in the SDK central keystore at `~/.llm-sdk/keys.env`.

## Preferred local keystore setup

Set the credentials directly in the central SDK keystore before running live tests:

```bash
mkdir -p ~/.llm-sdk
cat > ~/.llm-sdk/keys.env <<'EOF'
CODEX_API_KEY=replace-with-your-codex-api-key
CODEX_CHATGPT_ACCOUNT_ID=replace-with-your-chatgpt-account-id
EOF
```

Then run:

```bash
pnpm --filter @ank1015/llm-server test:live
```

## Optional server API setup

If the local server is already running, you can also populate the same keystore through the keys route:

```bash
curl -X PUT http://127.0.0.1:3000/api/keys/codex \
  -H 'Content-Type: application/json' \
  -d '{
    "credentials": {
      "apiKey": "replace-with-your-codex-api-key",
      "chatgpt-account-id": "replace-with-your-chatgpt-account-id"
    }
  }'
```

That route writes into the SDK central keystore used by the live session route tests.
