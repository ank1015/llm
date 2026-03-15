import { execSync } from 'node:child_process';
import { chmodSync, existsSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import * as https from 'node:https';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';

import type { Api } from '@ank1015/llm-sdk';

const CLAUDE_CAPTURE_TIMEOUT_MS = 30_000;

type CodexAuthPayload = {
  tokens?: {
    access_token?: string;
    account_id?: string;
  };
};

type ClaudeCodeQueryInput = {
  prompt: string;
  options: {
    systemPrompt: string;
    allowedTools: string[];
    maxTurns: number;
    model: string;
    pathToClaudeCodeExecutable: string;
  };
};

type ClaudeCodeQueryRunner = (input: ClaudeCodeQueryInput) => AsyncIterable<unknown>;

export const RELOADABLE_CREDENTIAL_APIS = new Set<Api>(['codex', 'claude-code']);

interface LoadCodexCredentialsOptions {
  homeDir?: string;
}

interface ExtractClaudeCodeCredentialsOptions {
  findClaudeExecutable?: () => string;
  queryRunner?: ClaudeCodeQueryRunner;
  tempDir?: string;
  timeoutMs?: number;
}

interface ReloadCredentialsOptions {
  codex?: LoadCodexCredentialsOptions;
  claudeCode?: ExtractClaudeCodeCredentialsOptions;
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function findClaudeExecutable(): string {
  return execSync('which claude', { encoding: 'utf8' }).trim();
}

async function loadClaudeCodeQueryRunner(
  queryRunner?: ClaudeCodeQueryRunner
): Promise<ClaudeCodeQueryRunner> {
  if (queryRunner) {
    return queryRunner;
  }

  const { query } = await import('@anthropic-ai/claude-agent-sdk');
  return query as ClaudeCodeQueryRunner;
}

export function loadCodexCredentials(
  options: LoadCodexCredentialsOptions = {}
): Record<string, string> {
  const authPath = join(options.homeDir ?? homedir(), '.codex', 'auth.json');
  if (!existsSync(authPath)) {
    throw new Error(`Codex auth file not found: ${authPath}`);
  }

  const auth = JSON.parse(readFileSync(authPath, 'utf8')) as CodexAuthPayload;
  const accessToken = auth.tokens?.access_token;
  const accountId = auth.tokens?.account_id;
  if (!accessToken) {
    throw new Error('No access_token found in codex auth.json');
  }

  const credentials: Record<string, string> = { apiKey: accessToken };
  if (accountId) {
    credentials['chatgpt-account-id'] = accountId;
  }

  return credentials;
}

export async function extractClaudeCodeCredentials(
  options: ExtractClaudeCodeCredentialsOptions = {}
): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    const timeoutMs = options.timeoutMs ?? CLAUDE_CAPTURE_TIMEOUT_MS;
    let settled = false;
    let wrapperPath: string | undefined;

    const finish = (result?: Record<string, string>, error?: Error): void => {
      if (settled) {
        return;
      }

      settled = true;
      clearTimeout(timeout);

      try {
        server.close();
      } catch {
        // Ignore cleanup failures while finishing the capture flow.
      }

      if (wrapperPath) {
        try {
          unlinkSync(wrapperPath);
        } catch {
          // Ignore cleanup failures while finishing the capture flow.
        }
      }

      if (error) {
        reject(error);
        return;
      }

      resolve(result ?? {});
    };

    const timeout = setTimeout(() => {
      finish(undefined, new Error(`Timeout: no credentials captured in ${timeoutMs}ms`));
    }, timeoutMs);

    const server = createServer((req, res) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });

      req.on('end', () => {
        try {
          const isMainCall =
            req.url?.startsWith('/v1/messages') &&
            !req.url?.includes('count_tokens') &&
            req.method === 'POST' &&
            body.includes('x-anthropic-billing-header');

          if (isMainCall) {
            const parsed = JSON.parse(body) as {
              system?: Array<{ text?: string }>;
            };
            const billingBlock = parsed.system?.find((block) =>
              block.text?.includes('x-anthropic-billing-header')
            );

            const token = String(req.headers['authorization'] ?? '').replace('Bearer ', '');
            const betaFlag = String(req.headers['anthropic-beta'] ?? '');

            const messageId = `msg_fake_${Date.now()}`;
            const events = [
              {
                type: 'message_start',
                message: {
                  id: messageId,
                  type: 'message',
                  role: 'assistant',
                  content: [],
                  model: 'claude-sonnet-4-5-20250929',
                  stop_reason: null,
                  stop_sequence: null,
                  usage: { input_tokens: 1, output_tokens: 0 },
                },
              },
              {
                type: 'content_block_start',
                index: 0,
                content_block: { type: 'text', text: '' },
              },
              {
                type: 'content_block_delta',
                index: 0,
                delta: { type: 'text_delta', text: 'ok' },
              },
              { type: 'content_block_stop', index: 0 },
              {
                type: 'message_delta',
                delta: { stop_reason: 'end_turn', stop_sequence: null },
                usage: { output_tokens: 1 },
              },
              { type: 'message_stop' },
            ];

            res.writeHead(200, {
              'cache-control': 'no-cache',
              'content-type': 'text/event-stream',
            });
            for (const event of events) {
              res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
            }
            res.end();

            finish({
              billingHeader: billingBlock?.text ?? '',
              betaFlag,
              oauthToken: token,
            });
            return;
          }

          const headers: Record<string, string> = {};
          for (const [key, value] of Object.entries(req.headers)) {
            if (key !== 'content-length' && key !== 'host' && value) {
              headers[key] = Array.isArray(value) ? (value[0] ?? '') : value;
            }
          }
          headers['content-length'] = Buffer.byteLength(body).toString();
          headers.host = 'api.anthropic.com';

          const proxyRequest = https.request(
            {
              headers,
              hostname: 'api.anthropic.com',
              method: req.method,
              path: req.url,
              port: 443,
            },
            (proxyResponse) => {
              res.writeHead(proxyResponse.statusCode ?? 200, proxyResponse.headers);
              proxyResponse.pipe(res);
            }
          );

          proxyRequest.on('error', () => {
            res.writeHead(502);
            res.end('error');
          });
          proxyRequest.end(body);
        } catch (error) {
          finish(undefined, toError(error));
        }
      });

      req.on('error', (error) => {
        finish(undefined, toError(error));
      });
    });

    server.listen(0, '127.0.0.1', async () => {
      try {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 0;

        const claudePath = (options.findClaudeExecutable ?? findClaudeExecutable)();
        const queryRunner = await loadClaudeCodeQueryRunner(options.queryRunner);

        wrapperPath = join(options.tempDir ?? tmpdir(), `claude-cred-extract-${port}.sh`);
        writeFileSync(
          wrapperPath,
          [
            '#!/bin/bash',
            `export ANTHROPIC_BASE_URL="http://127.0.0.1:${port}"`,
            'unset CLAUDECODE',
            `exec "${claudePath}" "$@"`,
          ].join('\n')
        );
        chmodSync(wrapperPath, 0o755);

        try {
          for await (const _ of queryRunner({
            prompt: 'hi',
            options: {
              systemPrompt: 'Reply ok',
              allowedTools: [],
              maxTurns: 1,
              model: 'sonnet',
              pathToClaudeCodeExecutable: wrapperPath,
            },
          })) {
            // Drain the iterator; the proxy capture resolves the promise.
          }
        } catch (error) {
          if (!settled) {
            finish(undefined, toError(error));
          }
        }
      } catch (error) {
        finish(undefined, toError(error));
      }
    });
  });
}

export async function reloadCredentials(
  api: Api,
  options: ReloadCredentialsOptions = {}
): Promise<Record<string, string>> {
  switch (api) {
    case 'codex':
      return loadCodexCredentials(options.codex);
    case 'claude-code':
      return extractClaudeCodeCredentials(options.claudeCode);
    default:
      throw new Error(`Reload not supported for ${api}`);
  }
}
