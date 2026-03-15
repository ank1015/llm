# Testing

## Unit tests

Run:

```bash
pnpm --filter @ank1015/llm-extension test:unit
```

Current unit coverage focuses on:

- stdio framing
- `ChromeClient` call/subscribe lifecycle
- `ChromeServer` proxying behavior
- `getPageMarkdown()` parsing and failure modes

## E2E tests

Core RPC E2E coverage:

```bash
pnpm --filter @ank1015/llm-extension test:e2e
pnpm --filter @ank1015/llm-extension test:e2e:accessibility
pnpm --filter @ank1015/llm-extension test:e2e:cookies
pnpm --filter @ank1015/llm-extension test:e2e:debugger
pnpm --filter @ank1015/llm-extension test:e2e:network
pnpm --filter @ank1015/llm-extension test:e2e:page-markdown
pnpm --filter @ank1015/llm-extension test:e2e:windows
```

These require:

- `pnpm --filter @ank1015/llm-extension build`
- the unpacked extension loaded in Chrome
- the native host installed
- a running Chrome instance

`test:e2e:page-markdown` also starts a temporary local converter service inside the test itself, but it still depends on a live Chrome bridge.

## Validation before release

- `lint`
- `typecheck`
- `build`
- `test:unit`
- `npm pack --dry-run`

Check the tarball for:

- packaged `manifests/`
- no stale `dist/sdk/window.*`
- no stale `dist/sdk/action/*`
- no stale `dist/sdk/observe/*`
