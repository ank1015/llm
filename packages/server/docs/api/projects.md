# Projects API

## `POST /api/projects`

Create a project.

Request body:

```json
{
  "name": "My Project",
  "description": "Optional description",
  "projectImg": "https://example.com/project.png"
}
```

Responses:

- `201` — returns `ProjectMetadata`
- `400` — `name is required`
- `409` — project already exists

## `GET /api/projects`

List all projects.

Responses:

- `200` — array of `ProjectMetadata`

## `PATCH /api/projects/project-img`

Update a project image by `projectId` or `projectName`.

Request body:

```json
{
  "projectId": "my-project",
  "projectName": "My Project",
  "projectImg": "https://example.com/project.png"
}
```

Rules:

- at least one of `projectId` or `projectName` must be provided
- `projectImg` is required

Responses:

- `200` — updated `ProjectMetadata`
- `400` — missing identifier or `projectImg`
- `404` — project not found

## `GET /api/projects/:projectId`

Fetch one project.

Responses:

- `200` — `ProjectMetadata`
- `404` — project not found

## `GET /api/projects/:projectId/overview`

Return one project plus its artifact directories and each artifact’s sessions.

Response shape:

```json
{
  "project": {},
  "artifactDirs": [
    {
      "id": "research",
      "name": "Research",
      "sessions": []
    }
  ]
}
```

Responses:

- `200`
- `404` — project not found

## `GET /api/projects/:projectId/file-index`

Search files and directories across all artifact directories in a project.

Query params:

- `query` — optional text filter
- `limit` — optional positive number, default `2000`, max `10000`

Response shape:

```json
{
  "projectId": "my-project",
  "query": "",
  "files": [
    {
      "artifactId": "app",
      "artifactName": "App",
      "path": "src/index.ts",
      "type": "file",
      "artifactPath": "app/src/index.ts",
      "size": 123,
      "updatedAt": "2026-03-15T00:00:00.000Z"
    }
  ],
  "truncated": false
}
```

Responses:

- `200`
- `400` — invalid `limit`
- `404` — project not found

## `PATCH /api/projects/:projectId/name`

Rename a project without changing its stable ID.

Request body:

```json
{
  "name": "New Display Name"
}
```

Responses:

- `200` — updated `ProjectMetadata`
- `400` — name missing/empty
- `404` — project not found

## `DELETE /api/projects/:projectId`

Delete the working directory and metadata directory for a project.

Responses:

- `200` — `{ "deleted": true }`
- `404` — project not found
