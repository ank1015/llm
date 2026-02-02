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
    layout.tsx          — Root layout with QueryProvider and Header
    page.tsx            — Overview page (usage dashboard with real API data)
    globals.css         — Global styles (Tailwind, dark theme)
    usage/
      page.tsx          — Usage history page
    settings/
      page.tsx          — API key management page
  components/
    index.ts            — Component exports
    header.tsx          — Navigation header
    ui/
      card.tsx          — Card components
    charts/
      monthly-bar-chart.tsx   — Bar chart for monthly data
      usage-area-chart.tsx    — Area chart for usage trends
      mini-bar-chart.tsx      — Small bar chart for cards
    dashboard/
      stat-card.tsx           — Statistics card with optional chart
      provider-stats-card.tsx — Provider ranking card
      usage-chart-card.tsx    — Usage chart with tabs
      token-breakdown-card.tsx — Input/output token breakdown
      mini-stat-card.tsx      — Compact stat card
      top-models-card.tsx     — Top models ranking
    settings/
      provider-key-card.tsx   — API key management card
  lib/
    api.ts              — API client for server communication
    queries/
      index.ts          — Query hook exports
      keys.ts           — API key query hooks
      usages.ts         — Usage statistics query hooks
  providers/
    query-provider.tsx  — TanStack Query provider
```

## Pages

- `/` — Overview dashboard with usage stats, costs, providers, models
- `/usage` — Usage history (placeholder)
- `/settings` — API key management for all providers

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
- Use Tailwind CSS for styling (dark theme)
- Use Google Sans font
- Server Components by default, 'use client' only when needed
- Use TanStack Query for data fetching
- All API calls go through `lib/api.ts`
- Use recharts for data visualization

## Dependencies

- Depends on: @ank1015/llm-types
- Runtime: recharts, @tanstack/react-query
- Depended on by: (none — end-user application)

## Migration Note

This dashboard needs to be migrated to use SDK adapters directly via Next.js API routes instead of calling the removed server package.
