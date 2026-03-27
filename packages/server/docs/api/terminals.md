# Artifact Terminals API

Base path:

`/api/projects/:projectId/artifacts/:artifactDirId/terminals`

Terminals are artifact-scoped, PTY-backed shell sessions. They launch in the artifact working directory and stay alive across page reloads while the server process stays up.

## `POST /api/projects/:projectId/artifacts/:artifactDirId/terminals`

Create a new terminal.

Request body:

```json
{
  "cols": 120,
  "rows": 30
}
```

Both fields are optional. The server defaults to `120x30`.

Responses:

- `201` — `TerminalMetadataDto`
- `400` — invalid body
- `404` — artifact not found

## `GET /api/projects/:projectId/artifacts/:artifactDirId/terminals`

List running and recently exited terminals for one artifact.

Responses:

- `200` — array of `TerminalSummaryDto`
- `404` — artifact not found

## `GET /api/projects/:projectId/artifacts/:artifactDirId/terminals/:terminalId`

Fetch one terminal.

Responses:

- `200` — `TerminalMetadataDto`
- `404` — artifact or terminal not found

## `DELETE /api/projects/:projectId/artifacts/:artifactDirId/terminals/:terminalId`

Kill a terminal if it is still running and remove it from the registry immediately.

Responses:

- `200` — `{ "deleted": true, "terminalId": "..." }`
- `404` — artifact or terminal not found

## `GET ws://.../api/projects/:projectId/artifacts/:artifactDirId/terminals/:terminalId/socket`

Attach a WebSocket client to a terminal.

Query params:

- `afterSeq` — optional non-negative sequence number for replay continuation

Client messages:

```json
{ "type": "input", "data": "pwd\n" }
```

```json
{ "type": "resize", "cols": 160, "rows": 48 }
```

Server messages:

```json
{
  "type": "ready",
  "terminal": {
    "id": "terminal-1",
    "title": "Terminal 1",
    "status": "running",
    "projectId": "my-project",
    "artifactId": "app",
    "cwdAtLaunch": "/Users/me/projects/my-project/app",
    "shell": "/bin/zsh",
    "cols": 120,
    "rows": 30,
    "createdAt": "2026-03-27T00:00:00.000Z",
    "lastActiveAt": "2026-03-27T00:00:00.000Z",
    "exitCode": null,
    "signal": null,
    "exitedAt": null
  }
}
```

```json
{ "type": "output", "seq": 1, "data": "hello\n" }
```

```json
{
  "type": "exit",
  "seq": 2,
  "exitCode": 0,
  "signal": null,
  "exitedAt": "2026-03-27T00:01:00.000Z"
}
```

Notes:

- only one active controlling socket is allowed per terminal; a new attach replaces the old one
- replay only includes retained output/exit/error frames, not the `ready` message
- exited terminals remain attachable for a short retention window before they are cleaned up
