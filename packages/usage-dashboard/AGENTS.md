# @ank1015/llm-usage-dashboard

Next.js dashboard for visualizing LLM usage statistics.

## Commands

- `pnpm dev` — Run development server (http://localhost:3000)
- `pnpm build` — Build for production
- `pnpm start` — Run production server
- `pnpm lint` — Run ESLint
- `pnpm typecheck` — Type-check without emitting

## Structure

```
src/
  app/
    layout.tsx        — Root layout with QueryProvider
    page.tsx          — Home page (API key management)
    globals.css       — Global styles (Tailwind)
  lib/
    api.ts            — API client for server communication
    queries/
      index.ts        — Query hook exports
      keys.ts         — API key query hooks
      usages.ts       — Usage statistics query hooks
  providers/
    query-provider.tsx — TanStack Query provider
```

## Environment Variables

- `NEXT_PUBLIC_API_URL` — Server URL (default: `http://localhost:3001`)

## Query Hooks

### Keys

- `useKeysQuery()` — List providers with stored keys
- `useKeyStatusQuery(api)` — Check if key exists for provider
- `useSaveKeyMutation()` — Save an API key
- `useDeleteKeyMutation()` — Delete an API key

### Usages

- `useUsageStatsQuery(filters?)` — Get aggregated usage statistics
- `useUsageMessagesQuery(filters?, pagination?)` — Get paginated message summaries

## Conventions

- Use App Router (Next.js 14+)
- Use Tailwind CSS for styling
- Server Components by default, 'use client' only when needed
- Use TanStack Query for data fetching
- All API calls go through `lib/api.ts`

## Dependencies

- Depends on: @ank1015/llm-server, @ank1015/llm-types
- Depended on by: (none — end-user application)
