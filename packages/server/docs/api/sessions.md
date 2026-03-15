# Sessions API

Base path:

`/api/projects/:projectId/artifacts/:artifactDirId/sessions`

## `POST /api/projects/:projectId/artifacts/:artifactDirId/sessions`

Create a session.

Request body:

```json
{
  "name": "Research Run",
  "api": "codex",
  "modelId": "gpt-5.4"
}
```

Responses:

- `201` — `SessionMetadataDto`
- `400` — `modelId and api are required`

`SessionMetadataDto`:

```json
{
  "id": "session-1",
  "name": "Research Run",
  "api": "codex",
  "modelId": "gpt-5.4",
  "createdAt": "2026-03-15T00:00:00.000Z",
  "activeBranch": "main"
}
```

## `GET /api/projects/:projectId/artifacts/:artifactDirId/sessions`

List sessions for one artifact directory.

Responses:

- `200` — array of `SessionSummaryDto`

`SessionSummaryDto`:

```json
{
  "sessionId": "session-1",
  "sessionName": "Research Run",
  "createdAt": "2026-03-15T00:00:00.000Z",
  "updatedAt": "2026-03-15T00:05:00.000Z",
  "nodeCount": 8
}
```

Notes:

- internal `filePath` and `branches` fields are intentionally not exposed

## `GET /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId`

Fetch session metadata.

Responses:

- `200` — `SessionMetadataDto`
- `404` — session not found

## `GET /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId/messages`

Fetch the persisted message path as `MessageNode[]`.

Responses:

- `200` — `MessageNode[]`
- `404` — session not found

## `GET /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId/tree`

Fetch the full session message tree, the persisted visible leaf, and optional live-run metadata.

Response shape:

```json
{
  "nodes": [],
  "persistedLeafNodeId": "node-id-or-null",
  "activeBranch": "main",
  "liveRun": {
    "runId": "uuid",
    "mode": "prompt",
    "status": "running",
    "startedAt": "2026-03-15T00:00:00.000Z"
  }
}
```

Responses:

- `200` — `SessionTreeResponse`
- `404` — session not found

Notes:

- `liveRun` is omitted when no run is active or replayable
- `nodes` are returned as session message-tree nodes, not cleaned summary DTOs

## `POST /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId/prompt`

Run one non-streaming session turn.

Request body:

```json
{
  "message": "Summarize the current findings",
  "leafNodeId": "optional-node-id",
  "api": "optional-provider-override",
  "modelId": "optional-model-override",
  "reasoningLevel": "low | medium | high | xhigh"
}
```

Rules:

- `message` is required
- `api` and `modelId` must be provided together if overriding the session default
- `reasoning` is also accepted as a backward-compatible alias for `reasoningLevel`

Responses:

- `200` — array of newly created `Message` objects
- `400` — invalid input
- `500` — runtime failure

## `POST /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId/generate-name`

Generate a short session name from a query.

Request body:

```json
{
  "query": "Research Gemini image editing model options"
}
```

Responses:

- `200` — `{ "ok": true, "sessionId": "...", "sessionName": "..." }`
- `400` — `query is required`
- `500` — generation failure

## `PATCH /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId/name`

Manually rename a session.

Request body:

```json
{
  "name": "Gemini model comparison"
}
```

Responses:

- `200` — `{ "ok": true, "sessionId": "...", "sessionName": "..." }`
- `400` — missing/empty `name`
- `500` — update failure

## `DELETE /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId`

Delete the persisted session tree and session metadata.

Responses:

- `200` — `{ "ok": true, "sessionId": "...", "deleted": true }`
- `500` — delete failure

## Notes

- Session execution automatically wires tools and system prompt from `@ank1015/llm-agents`.
- Retry/edit streaming endpoints are documented separately in [streaming.md](./streaming.md).
