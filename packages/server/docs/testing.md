# Server Testing

The server package now has three test layers:

- `pnpm --filter @ank1015/llm-server test:unit`
- `pnpm --filter @ank1015/llm-server test:integration`
- `pnpm --filter @ank1015/llm-server test:live`

`test:live` is opt-in and expects Codex credentials in the SDK central keystore at `~/.llm-sdk/keys.env`.

## Standard package checks

For routine local validation, use:

```bash
pnpm --filter @ank1015/llm-server build
pnpm --filter @ank1015/llm-server typecheck
pnpm --filter @ank1015/llm-server test
```

`lint` is also available, but the package currently has known import-order/style debt that is separate from runtime validation.

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

## Related docs

- `README.md` for the package overview and command list
- `docs/architecture.md` for route and storage layout
- `docs/configuration.md` for host, port, and filesystem defaults
