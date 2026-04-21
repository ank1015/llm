# @ank1015/llm

A very opinionated LLM stack.

## Apps

- `apps/web` - Next.js web client for the local server.
- `apps/setup` - Electron setup app for checking prerequisites and launching the main app through `npx`.

## Release

Always bump the version in each package you plan to publish before running the publish command. For
the `npx @ank1015/llm` package, update `packages/app/package.json`.

Release a new `npx @ank1015/llm` build:

```bash
pnpm release:app:build
pnpm release:app:smoke
pnpm --dir packages/app publish
```

Shortcut:

```bash
pnpm release:app:publish
```

Publish the runtime packages when `packages/core`, `packages/sdk`, `packages/gateway`,
`packages/agents`, or `packages/server` changed:

```bash
pnpm release:runtime:publish
```

Publish runtime packages and the `npx` app together:

```bash
pnpm release:publish
```

Useful post-publish checks:

```bash
npm dist-tag ls @ank1015/llm
npx @ank1015/llm@latest
```
