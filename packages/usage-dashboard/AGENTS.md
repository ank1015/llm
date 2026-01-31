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
    layout.tsx        — Root layout
    page.tsx          — Home page (usage dashboard)
    globals.css       — Global styles (Tailwind)
  components/         — React components
  lib/                — Utility functions
```

## Conventions

- Use App Router (Next.js 14+)
- Use Tailwind CSS for styling
- Server Components by default, 'use client' only when needed
- Access usage data via DbService from @ank1015/llm-server

## Dependencies

- Depends on: @ank1015/llm-server, @ank1015/llm-types
- Depended on by: (none — end-user application)
