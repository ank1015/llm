# Architecture

`@ank1015/llm-native-app` is the Expo mobile client for the monorepo's server-backed workflow.

## Main layers

- `src/app/`
  Expo Router entrypoints. These files stay thin and mostly hand off to screen/layout
  components.
- `src/components/projects/`
  The real product surface. It owns projects, artifact exploration, thread UI, dialogs,
  drawer layout, and mobile/web-specific file viewers.
- `src/lib/client-api/`
  The HTTP boundary to `@ank1015/llm-server`. All request/response types come from
  `@ank1015/llm-app-contracts`.
- `src/stores/`
  Zustand state for projects, sessions, sidebar state, artifact files, chat state, and
  persisted UI/composer state.
- `src/lib/messages/`
  Helpers that turn server/session data into mobile-friendly thread and working-trace views.

## Data flow

1. Expo Router routes mount project/thread screens.
2. Screens call Zustand store actions.
3. Stores call `src/lib/client-api/*`.
4. `client-api` talks to `@ank1015/llm-server`.
5. Shared DTOs and SSE payloads come from `@ank1015/llm-app-contracts`.

## Branding

The workspace package is named `@ank1015/llm-native-app`, but the app/product branding is
currently **Folders**. That difference is intentional for now and should be documented rather
than silently “fixed” in random files.
