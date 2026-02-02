# @ank1015/llm-chat-app

Next.js chat app package.

## Commands

- `pnpm dev` - Run development server (http://localhost:3000)
- `pnpm build` - Build for production
- `pnpm start` - Run production server
- `pnpm lint` - Run ESLint
- `pnpm typecheck` - Type-check without emitting

## API routes (scaffolded)

All routes are created and currently return `501 NOT_IMPLEMENTED` except health.

- `GET /api/health`
- `GET /api/models`
- `GET /api/providers`
- `GET /api/keys`
- `PUT /api/keys/[provider]`
- `DELETE /api/keys/[provider]`
- `GET /api/sessions`
- `POST /api/sessions`
- `GET /api/sessions/[sessionId]`
- `PATCH /api/sessions/[sessionId]`
- `DELETE /api/sessions/[sessionId]`
- `GET /api/sessions/[sessionId]/messages`
- `POST /api/sessions/[sessionId]/messages`
- `POST /api/sessions/[sessionId]/messages/[messageId]/regenerate`
- `POST /api/sessions/[sessionId]/stream`
- `GET /api/sessions/[sessionId]/branches`
- `POST /api/sessions/[sessionId]/branches`
- `GET /api/usage/stats`
- `GET /api/usage/messages`
