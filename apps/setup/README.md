# LLM Setup App

Private Electron app for helping users install prerequisites such as Git and Node.js, then launching the main app through `npx`.

## Development

```bash
pnpm --filter @ank1015/llm-setup-app dev
```

## Build

```bash
pnpm --filter @ank1015/llm-setup-app build
pnpm --filter @ank1015/llm-setup-app dist
```

The initial scaffold includes prerequisite detection for `git`, `node`, `npm`, and `npx`. The launch command is currently a placeholder and should be updated once the final public CLI package name is chosen.
