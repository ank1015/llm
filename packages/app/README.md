# @ank1015/llm

Run the local LLM runtime app with:

```bash
npx @ank1015/llm
```

The launcher starts:

- the app on `http://127.0.0.1:3210`
- the API under the same origin at `http://127.0.0.1:3210/api`

The Hono API server and Next.js web client run on private random ports behind the launcher.

## Options

```bash
llm --host 127.0.0.1 --port 3210 --no-open
```
