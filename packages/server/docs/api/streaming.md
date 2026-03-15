# Session Streaming API

Streaming endpoints use Server-Sent Events.

Base path:

`/api/projects/:projectId/artifacts/:artifactDirId/sessions`

## SSE Event Types

The server may emit:

- `ready` — stream setup confirmed; includes `runId` and current run status
- `agent_event` — forwarded runtime event from the agent loop
- `node_persisted` — message node persisted into the session tree
- `done` — terminal success event with `completed` or `cancelled` status
- `error` — terminal failure event

The server also emits keep-alive comments while a run is active.

## `POST /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId/stream`

Start a live prompt run.

Request body matches the non-streaming prompt body:

```json
{
  "message": "Continue from the current branch",
  "leafNodeId": "optional-node-id",
  "api": "optional-provider-override",
  "modelId": "optional-model-override",
  "reasoningLevel": "low | medium | high | xhigh"
}
```

Responses:

- `200` — SSE stream
- `400` — invalid body
- `404` — session not found
- `409` — another run is already active for the session

## `POST /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId/messages/:nodeId/retry/stream`

Start a retry run from a prior user message.

Request body:

```json
{
  "leafNodeId": "optional-visible-leaf",
  "api": "optional-provider-override",
  "modelId": "optional-model-override",
  "reasoningLevel": "low | medium | high | xhigh"
}
```

Responses:

- `200` — SSE stream
- `400` — invalid body
- `404` — session not found
- `409` — another run is already active

## `POST /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId/messages/:nodeId/edit/stream`

Start an edit run from a prior user message.

Request body:

```json
{
  "message": "Rephrase the original user request",
  "leafNodeId": "optional-visible-leaf",
  "api": "optional-provider-override",
  "modelId": "optional-model-override",
  "reasoningLevel": "low | medium | high | xhigh"
}
```

Responses:

- `200` — SSE stream
- `400` — invalid body
- `404` — session not found
- `409` — another run is already active

## `GET /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId/runs/:runId/stream`

Reattach to an existing live or recently completed run.

Query params:

- `afterSeq` — optional positive sequence number for replay continuation

Responses:

- `200` — SSE stream
- `404` — run not found

## `POST /api/projects/:projectId/artifacts/:artifactDirId/sessions/:sessionId/runs/:runId/cancel`

Cancel a live run.

Responses:

- `200` — `{ "ok": true, "sessionId": "...", "runId": "...", "cancelled": true }`
- `404` — run not found
- `409` — run exists but is no longer active
