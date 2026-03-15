# Architecture

`@ank1015/llm-web-app` is a server-backed Next.js App Router client for `@ank1015/llm-server`.

## Main Layers

- `src/app/` renders the project, artifact, thread, and artifact-browser pages
- `src/lib/client-api/` performs HTTP/SSE calls to the server and uses `@ank1015/llm-app-contracts` for DTOs and event payloads
- `src/stores/` owns client-side state for sessions, sidebar structure, artifact files, chat state, and composer state
- `src/components/` contains the app shell, chat UI, markdown/code rendering, and artifact viewers

## Server Boundary

- The app does not own local API routes
- All project/artifact/session/skill interactions go through `client-api`
- Streaming conversation uses SSE from the server session routes

## Main User Flows

- list, create, rename, and delete projects
- open an artifact directory and manage sessions
- stream conversation turns and attach to live runs
- browse and preview artifact files
- install bundled skills for an artifact
