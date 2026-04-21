# Protocol

## `POST /v1/auth/login`

Request body:

```ts
{
  username: string;
  password: string;
}
```

Response:

```ts
{
  accessToken: string;
  accessTokenExpiresAt: number;
  refreshToken: string;
  refreshTokenExpiresAt: number;
  refreshTokenId: string;
  senderId: string;
}
```

## `POST /v1/llm/stream`

Request body:

```ts
{
  api: string;
  modelId: string;
  messages: unknown[];
  systemPrompt?: string;
  tools?: unknown[];
  providerOptions?: Record<string, unknown>;
  requestId?: string;
}
```

Response:

- `Content-Type: text/event-stream`
- each `data:` payload is a raw `BaseAssistantEvent`
- heartbeat frames are SSE comments
- gateway trace id is returned in `X-Gateway-Request-Id`

## `POST /v1/image/generate`

Request body:

```ts
{
  api: string;
  modelId: string;
  prompt: string;
  images?: Array<{ type: 'image'; data: string; mimeType: string }>;
  mask?: { type: 'image'; data: string; mimeType: string };
  providerOptions?: Record<string, unknown>;
  requestId?: string;
}
```

Response:

```ts
{
  result: BaseImageResult;
}
```

The gateway never writes files; callers save image output themselves.
