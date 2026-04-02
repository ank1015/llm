# Web App Architecture

`apps/web` is the private Next.js client for the local llm server stack.

## Main Layers

- `src/app/` provides the App Router entrypoints
- `src/components/` renders the project browser, artifact workspace, chat, and terminal UI
- `src/lib/client-api/` wraps the server's HTTP and WebSocket endpoints
- `src/hooks/api/` adapts the client-api layer into React Query hooks
- `src/stores/` keeps local UI and workflow state in Zustand

## Main Screens

- `/` shows the projects browser and creation flow
- `/:projectId` hosts the project workspace layout, artifact panels, session views, and terminals

## Server Dependency

The app expects the local backend to speak the `@ank1015/llm-server/contracts` DTO layer and defaults to `http://localhost:8001` unless `NEXT_PUBLIC_LLM_SERVER_BASE_URL` is set.

## Testing Scope

The current test suite is unit-heavy and focuses on:

- client-api helpers
- stores
- hooks
- major workspace components
