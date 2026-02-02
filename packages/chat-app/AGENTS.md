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
      keys/
        route.ts              — GET: list providers with key status
        [provider]/route.ts   — PUT: set key, DELETE: delete key
  lib/
    api/
      keys.ts                 — Keys adapter factory and helpers
      response.ts             — API response utilities
```

## API Endpoints

### Keys API

- `GET /api/keys` — List all providers and whether they have a key stored
- `PUT /api/keys/[provider]` — Set API key (body: `{ "key": "..." }`)
- `DELETE /api/keys/[provider]` — Delete API key

## Dependencies

- Depends on: @ank1015/llm-sdk (for adapters)

## Conventions

- Use App Router (Next.js 14+)
- Use strict TypeScript
- Server Components by default
- Scaffold new API routes first, then fill business logic incrementally
