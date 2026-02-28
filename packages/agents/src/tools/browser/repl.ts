import * as nodeModule from 'node:module';
import { inspect } from 'node:util';

import { Window } from '@ank1015/llm-extension';
import { type Static, Type } from '@sinclair/typebox';

import { browserToolError, toBrowserToolError } from './errors.js';

import type { AgentTool } from '@ank1015/llm-sdk';

const windowReplSchema = Type.Object({
  code: Type.String({
    description:
      'TypeScript snippet to execute. The runtime environment already defines `window` and `Window`.',
  }),
  windowId: Type.Optional(
    Type.Number({
      description:
        'Optional browser window id override for this execution. If omitted, uses the tool-level default or creates a new window.',
    })
  ),
});

export type WindowReplToolInput = Static<typeof windowReplSchema>;

export interface WindowReplToolDetails {
  mode: 'expression' | 'block';
  windowId?: number;
  resultType: string;
  result: JsonValue;
  logs: string[];
  image?: {
    mimeType: string;
    bytes: number;
  };
}

interface WindowLike {
  ready: Promise<void>;
}

interface WindowConstructor {
  new (windowId?: number): WindowLike;
}

export interface WindowReplOperations {
  createWindow?: (windowId?: number) => WindowLike;
  WindowClass?: WindowConstructor;
}

export interface WindowReplToolOptions {
  /** Optional default browser window id for the tool instance */
  windowId?: number;
  /** Optional runtime overrides for tests/custom execution */
  operations?: WindowReplOperations;
}

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface ReplEnvironment {
  Window: WindowConstructor;
  window: WindowLike;
  windowId: number | undefined;
  id: number | undefined;
  console: Console;
}

interface ReplExecutionResult {
  mode: 'expression' | 'block';
  value: unknown;
}

interface StripTypeScriptTypesOptions {
  mode?: 'strip' | 'transform';
  sourceMap?: boolean;
  sourceUrl?: string;
}

type StripTypeScriptTypesFn = (code: string, options?: StripTypeScriptTypesOptions) => string;

const WINDOW_REPL_TYPE_PRELUDE = `
type WindowOpenOptions = import('@ank1015/llm-extension').WindowOpenOptions;
type WindowScreenshotOptions = import('@ank1015/llm-extension').WindowScreenshotOptions;
type WindowEvaluateOptions = import('@ank1015/llm-extension').WindowEvaluateOptions;
type WindowDownloadOptions = import('@ank1015/llm-extension').WindowDownloadOptions;
type WindowGetPageOptions = import('@ank1015/llm-extension').WindowGetPageOptions;
type ObserveFilter = import('@ank1015/llm-extension').ObserveFilter;
type WindowObserveOptions = import('@ank1015/llm-extension').WindowObserveOptions;
type WindowActionOptions = import('@ank1015/llm-extension').WindowActionOptions;
type WindowTypeOptions = import('@ank1015/llm-extension').WindowTypeOptions;
type WindowScrollBehavior = import('@ank1015/llm-extension').WindowScrollBehavior;
type WindowScrollOptions = import('@ank1015/llm-extension').WindowScrollOptions;
type WindowTab = import('@ank1015/llm-extension').WindowTab;
type WindowInstance = import('@ank1015/llm-extension').Window;
declare const Window: typeof import('@ank1015/llm-extension').Window;
declare const window: import('@ank1015/llm-extension').Window;
declare const windowId: number | undefined;
declare const id: number | undefined;
`;

const DEFAULT_MAX_SERIALIZATION_DEPTH = 4;
const DEFAULT_MAX_SERIALIZATION_ITEMS = 80;
const IMAGE_ATTACHED_TEXT = 'Image attached';

function normalizeWindowId(
  value: number | undefined,
  context: 'options.windowId' | 'input.windowId'
): number | undefined {
  if (value === undefined) {
    return undefined;
  }

  if (!Number.isInteger(value) || value <= 0) {
    throw browserToolError('INVALID_INPUT', `${context} must be a positive integer`);
  }

  return value;
}

function createReplConsole(logs: string[]): Console {
  const formatArgs = (args: readonly unknown[]): string =>
    args
      .map((value) =>
        typeof value === 'string'
          ? value
          : inspect(value, { depth: 4, compact: true, colors: false })
      )
      .join(' ');

  const append = (level: 'log' | 'info' | 'warn' | 'error' | 'debug', args: readonly unknown[]) => {
    const prefix = level === 'log' || level === 'info' ? '' : `${level.toUpperCase()}: `;
    logs.push(`${prefix}${formatArgs(args)}`);
  };

  return {
    ...console,
    log: (...args: unknown[]) => {
      append('log', args);
    },
    info: (...args: unknown[]) => {
      append('info', args);
    },
    warn: (...args: unknown[]) => {
      append('warn', args);
    },
    error: (...args: unknown[]) => {
      append('error', args);
    },
    debug: (...args: unknown[]) => {
      append('debug', args);
    },
  } as Console;
}

function getStripTypeScriptTypes(): StripTypeScriptTypesFn {
  const strip = (
    nodeModule as unknown as {
      stripTypeScriptTypes?: StripTypeScriptTypesFn;
    }
  ).stripTypeScriptTypes;

  if (typeof strip !== 'function') {
    throw browserToolError(
      'INTERNAL',
      'Current Node runtime does not support TypeScript transformation for repl'
    );
  }

  return strip;
}

function transpileTypeScript(source: string): string {
  const stripTypeScriptTypes = getStripTypeScriptTypes();

  try {
    return stripTypeScriptTypes(source, {
      mode: 'transform',
      sourceMap: false,
      sourceUrl: 'window-repl.ts',
    });
  } catch (error) {
    throw browserToolError(
      'INVALID_INPUT',
      `TypeScript parsing failed: ${error instanceof Error ? error.message : String(error)}`,
      { cause: error }
    );
  }
}

function buildExpressionSource(code: string): string {
  return `${WINDOW_REPL_TYPE_PRELUDE}
const __windowReplResult = await (
${code}
);`;
}

function buildBlockSource(code: string): string {
  return `${WINDOW_REPL_TYPE_PRELUDE}
const __windowReplMain = async (): Promise<unknown> => {
${code}
};
const __windowReplResult = await __windowReplMain();`;
}

function getAsyncFunctionConstructor(): new (
  ...args: string[]
) => (...args: unknown[]) => Promise<unknown> {
  return Object.getPrototypeOf(async () => undefined).constructor as new (
    ...args: string[]
  ) => (...args: unknown[]) => Promise<unknown>;
}

async function runJavaScript(source: string, environment: ReplEnvironment): Promise<unknown> {
  const AsyncFunction = getAsyncFunctionConstructor();
  const argumentNames = Object.keys(environment);
  const argumentValues = argumentNames.map((name) => environment[name as keyof ReplEnvironment]);
  const runner = new AsyncFunction(...argumentNames, `${source}\nreturn __windowReplResult;`);
  return await runner(...argumentValues);
}

async function executeTypeScript(
  code: string,
  environment: ReplEnvironment
): Promise<ReplExecutionResult> {
  const expressionSource = buildExpressionSource(code);
  const expressionJavaScript = tryTranspile(expressionSource);

  if (expressionJavaScript) {
    const value = await runJavaScript(expressionJavaScript, environment);
    return { mode: 'expression', value };
  }

  const blockSource = buildBlockSource(code);
  const blockJavaScript = transpileTypeScript(blockSource);
  const value = await runJavaScript(blockJavaScript, environment);
  return { mode: 'block', value };
}

function tryTranspile(source: string): string | undefined {
  try {
    return transpileTypeScript(source);
  } catch (error) {
    if (error instanceof Error && error.message.includes('[INVALID_INPUT]')) {
      return undefined;
    }
    throw error;
  }
}

function getResultType(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (Array.isArray(value)) {
    return 'array';
  }

  return typeof value;
}

function toJsonValue(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
  maxDepth = DEFAULT_MAX_SERIALIZATION_DEPTH,
  maxItems = DEFAULT_MAX_SERIALIZATION_ITEMS
): JsonValue {
  if (value === null) {
    return null;
  }

  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }

  if (typeof value === 'bigint') {
    return `${value.toString()}n`;
  }

  if (typeof value === 'symbol') {
    return value.toString();
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
      ...(value.stack ? { stack: value.stack } : {}),
    };
  }

  if (depth >= maxDepth) {
    return '[MaxDepth]';
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, maxItems)
      .map((entry) => toJsonValue(entry, depth + 1, seen, maxDepth, maxItems));
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }
    seen.add(value);

    const normalized: { [key: string]: JsonValue } = {};
    const entries = Object.entries(value as Record<string, unknown>).slice(0, maxItems);

    for (const [key, entryValue] of entries) {
      normalized[key] = toJsonValue(entryValue, depth + 1, seen, maxDepth, maxItems);
    }

    return normalized;
  }

  return String(value);
}

function renderJsonValue(value: JsonValue): string {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
    return String(value);
  }

  return JSON.stringify(value, null, 2);
}

function looksLikeBase64(value: string): boolean {
  if (!value || value.length < 80 || value.length % 4 !== 0) {
    return false;
  }

  return /^[A-Za-z0-9+/]+={0,2}$/u.test(value);
}

function detectImageMimeTypeFromBase64(value: string): string | undefined {
  if (!looksLikeBase64(value)) {
    return undefined;
  }

  let header: Buffer;
  try {
    header = Buffer.from(value.slice(0, 64), 'base64');
  } catch {
    return undefined;
  }

  if (header.length >= 8) {
    const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    const isPng = png.every((byte, index) => header[index] === byte);
    if (isPng) {
      return 'image/png';
    }
  }

  if (header.length >= 3 && header[0] === 0xff && header[1] === 0xd8 && header[2] === 0xff) {
    return 'image/jpeg';
  }

  if (
    header.length >= 12 &&
    header.subarray(0, 4).toString('ascii') === 'RIFF' &&
    header.subarray(8, 12).toString('ascii') === 'WEBP'
  ) {
    return 'image/webp';
  }

  return undefined;
}

function createDefaultWindow(
  windowId: number | undefined,
  WindowClass: WindowConstructor
): WindowLike {
  // Window accepts a scoped numeric id; undefined creates a new Chrome window.
  return typeof windowId === 'number' ? new WindowClass(windowId) : new WindowClass();
}

export function createWindowReplTool(
  options?: WindowReplToolOptions
): AgentTool<typeof windowReplSchema> {
  const defaultWindowId = normalizeWindowId(options?.windowId, 'options.windowId');
  const WindowClass = options?.operations?.WindowClass ?? (Window as unknown as WindowConstructor);
  const createWindow =
    options?.operations?.createWindow ??
    ((windowId?: number): WindowLike => createDefaultWindow(windowId, WindowClass));

  return {
    name: 'repl',
    label: 'repl',
    description:
      'Run TypeScript code in a browser REPL. Environment includes `window` (Window SDK instance), `Window` class, and Window SDK type aliases.',
    parameters: windowReplSchema,
    execute: async (_toolCallId: string, input: WindowReplToolInput) => {
      const code = input.code.trim();
      if (!code) {
        throw browserToolError('INVALID_INPUT', 'code must be a non-empty TypeScript snippet');
      }

      const executionWindowId = normalizeWindowId(
        input.windowId ?? defaultWindowId,
        'input.windowId'
      );

      const window = createWindow(executionWindowId);
      await window.ready;

      const logs: string[] = [];
      const replConsole = createReplConsole(logs);

      try {
        const execution = await executeTypeScript(code, {
          Window: WindowClass,
          window,
          windowId: executionWindowId,
          id: executionWindowId,
          console: replConsole,
        });

        const resultType = getResultType(execution.value);
        const imageMimeType =
          typeof execution.value === 'string'
            ? detectImageMimeTypeFromBase64(execution.value)
            : undefined;

        if (imageMimeType && typeof execution.value === 'string') {
          const bytes = Buffer.byteLength(execution.value, 'base64');
          const lines = [`Execution mode: ${execution.mode}`, 'Result:', IMAGE_ATTACHED_TEXT];

          if (logs.length > 0) {
            lines.push('', `Console output (${logs.length}):`);
            lines.push(...logs.map((entry) => `- ${entry}`));
          }

          return {
            content: [
              {
                type: 'text',
                content: lines.join('\n'),
              },
              {
                type: 'image',
                data: execution.value,
                mimeType: imageMimeType,
              },
            ],
            details: {
              mode: execution.mode,
              windowId: executionWindowId,
              resultType: 'image',
              result: IMAGE_ATTACHED_TEXT,
              logs,
              image: {
                mimeType: imageMimeType,
                bytes,
              },
            },
          };
        }

        const result = toJsonValue(execution.value);

        const lines = [
          `Execution mode: ${execution.mode}`,
          `Result type: ${resultType}`,
          'Result:',
          renderJsonValue(result),
        ];

        if (logs.length > 0) {
          lines.push('', `Console output (${logs.length}):`);
          lines.push(...logs.map((entry) => `- ${entry}`));
        }

        return {
          content: [
            {
              type: 'text',
              content: lines.join('\n'),
            },
          ],
          details: {
            mode: execution.mode,
            windowId: executionWindowId,
            resultType,
            result,
            logs,
          },
        };
      } catch (error) {
        throw toBrowserToolError(error, 'INTERNAL', 'repl execution failed');
      }
    },
  };
}
