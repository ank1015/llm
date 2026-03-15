# Artifact Directories API

Base path:

`/api/projects/:projectId/artifacts`

## `POST /api/projects/:projectId/artifacts`

Create an artifact directory.

Request body:

```json
{
  "name": "Research",
  "description": "Optional description"
}
```

Responses:

- `201` — `ArtifactDirMetadata`
- `400` — `name is required`
- `409` — artifact already exists or project setup failed

## `GET /api/projects/:projectId/artifacts`

List artifact directories for a project.

Responses:

- `200` — array of `ArtifactDirMetadata`

## `GET /api/projects/:projectId/artifacts/:artifactDirId`

Fetch one artifact directory.

Responses:

- `200` — `ArtifactDirMetadata`
- `404` — artifact not found

## `PATCH /api/projects/:projectId/artifacts/:artifactDirId/name`

Rename an artifact directory without changing its stable ID.

Request body:

```json
{
  "name": "New Display Name"
}
```

Responses:

- `200` — updated `ArtifactDirMetadata`
- `400` — missing name
- `404` — artifact not found

## `GET /api/projects/:projectId/artifacts/:artifactDirId/files`

List top-level files in the artifact working directory.

Responses:

- `200` — array of file names
- `404` — artifact not found

## `GET /api/projects/:projectId/artifacts/:artifactDirId/explorer`

List one directory level for explorer UIs.

Query params:

- `path` — optional relative path; empty means the artifact root

Responses:

- `200` — `ArtifactExplorerResult`
- `400` — invalid path or path is not a directory
- `404` — artifact/path not found

## `GET /api/projects/:projectId/artifacts/:artifactDirId/file`

Read a text file from the artifact tree.

Query params:

- `path` — required relative file path
- `maxBytes` — optional positive number

Responses:

- `200` — `ArtifactFileResult`
- `400` — missing/invalid path, invalid `maxBytes`, or path is not a file
- `404` — artifact/path not found

Notes:

- binary files return `isBinary: true` with empty `content`
- text files may return `truncated: true`

## `GET /api/projects/:projectId/artifacts/:artifactDirId/file/raw`

Read raw file bytes for downloads/media previews.

Query params:

- `path` — required relative file path

Responses:

- `200` — raw bytes with inferred `Content-Type`
- `400` — missing/invalid path or path is not a file
- `404` — artifact/path not found

## `GET /api/projects/:projectId/artifacts/:artifactDirId/skills`

List installed artifact-local skills.

Responses:

- `200` — array of installed skill entries
- `404` — artifact not found

## `POST /api/projects/:projectId/artifacts/:artifactDirId/skills`

Install one bundled skill into the artifact’s `.max/skills` directory.

Request body:

```json
{
  "skillName": "ai-images"
}
```

Responses:

- `200` — installed skill metadata
- `400` — missing `skillName` or unknown bundled skill
- `404` — artifact not found

## `DELETE /api/projects/:projectId/artifacts/:artifactDirId/skills/:skillName`

Delete one installed artifact-local skill.

Responses:

- `200` — deleted skill metadata
- `400` — missing `skillName`
- `404` — artifact or installed skill not found

## `PATCH /api/projects/:projectId/artifacts/:artifactDirId/path/rename`

Rename a file or directory inside the artifact tree.

Request body:

```json
{
  "path": "src/index.ts",
  "newName": "main.ts"
}
```

Responses:

- `200` — `{ "ok": true, "oldPath": "...", "newPath": "...", "type": "file" | "directory" }`
- `400` — invalid path/new name
- `404` — artifact/path not found
- `409` — target path already exists

## `DELETE /api/projects/:projectId/artifacts/:artifactDirId/path`

Delete a file or directory inside the artifact tree.

Query params:

- `path` — required relative path

Responses:

- `200` — `{ "ok": true, "deleted": true, "path": "...", "type": "file" | "directory" }`
- `400` — invalid path
- `404` — artifact/path not found

## `DELETE /api/projects/:projectId/artifacts/:artifactDirId`

Delete the artifact working directory and metadata directory.

Responses:

- `200` — `{ "deleted": true }`
- `404` — artifact not found
