# @ank1015/llm-chat-app

Next.js chat application package.

## Commands

- `pnpm dev` - Run development server
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Type-check without emitting

## Structure

```
src/
  app/
    layout.tsx
    page.tsx
    globals.css
    api/
      ... route.ts files for chat/provider/key/session/usage APIs
  lib/
    api/
      placeholder.ts
```

## Conventions

- Use App Router (Next.js 14+)
- Use strict TypeScript
- Server Components by default
- Scaffold new API routes first, then fill business logic incrementally
