import {
  mkdir as fsMkdir,
  readFile as fsReadFile,
  rm as fsRm,
  writeFile as fsWriteFile,
} from 'fs/promises';
import { dirname } from 'path';

import { type Static, Type } from '@sinclair/typebox';

import { resolveToCwd } from './path-utils.js';

import type { AgentTool } from '@ank1015/llm-core';

export const APPLY_PATCH_LARK_GRAMMAR = `start: begin_patch hunk+ end_patch
begin_patch: "*** Begin Patch" LF
end_patch: "*** End Patch" LF?

hunk: add_hunk | delete_hunk | update_hunk
add_hunk: "*** Add File: " filename LF add_line+
delete_hunk: "*** Delete File: " filename LF
update_hunk: "*** Update File: " filename LF change_move? change?

filename: /(.+)/
add_line: "+" /(.*)/ LF -> line

change_move: "*** Move to: " filename LF
change: (change_context | change_line)+ eof_line?
change_context: ("@@" | "@@ " /(.+)/) LF
change_line: ("+" | "-" | " ") /(.*)/ LF
eof_line: "*** End of File" LF

%import common.LF`;

const BEGIN_PATCH_MARKER = '*** Begin Patch';
const END_PATCH_MARKER = '*** End Patch';
const ADD_FILE_MARKER = '*** Add File: ';
const DELETE_FILE_MARKER = '*** Delete File: ';
const UPDATE_FILE_MARKER = '*** Update File: ';
const MOVE_TO_MARKER = '*** Move to: ';
const EOF_MARKER = '*** End of File';
const CHANGE_CONTEXT_MARKER = '@@ ';
const EMPTY_CHANGE_CONTEXT_MARKER = '@@';
const UPDATE_HUNK_EMPTY = 'Update hunk does not contain any lines';
const OPERATION_ABORTED = 'Operation aborted';

const applyPatchSchema = Type.Object({
  input: Type.String({ description: 'The entire contents of the apply_patch command' }),
});

export type ApplyPatchToolInput = Static<typeof applyPatchSchema>;

export interface ApplyPatchToolDetails {
  added: string[];
  modified: string[];
  deleted: string[];
}

export interface ApplyPatchOperations {
  readFile: (absolutePath: string) => Promise<string>;
  writeFile: (absolutePath: string, content: string) => Promise<void>;
  mkdir: (dir: string) => Promise<void>;
  rm: (absolutePath: string) => Promise<void>;
}

const defaultApplyPatchOperations: ApplyPatchOperations = {
  readFile: (path) => fsReadFile(path, 'utf-8'),
  writeFile: (path, content) => fsWriteFile(path, content, 'utf-8'),
  mkdir: (dir) => fsMkdir(dir, { recursive: true }).then(() => {}),
  rm: (path) => fsRm(path),
};

export interface ApplyPatchToolOptions {
  operations?: ApplyPatchOperations;
}

interface AddFileHunk {
  type: 'add';
  path: string;
  contents: string;
}

interface DeleteFileHunk {
  type: 'delete';
  path: string;
}

interface UpdateFileChunk {
  changeContext?: string;
  oldLines: string[];
  newLines: string[];
  isEndOfFile: boolean;
}

interface UpdateFileHunk {
  type: 'update';
  path: string;
  movePath?: string;
  chunks: UpdateFileChunk[];
}

type PatchHunk = AddFileHunk | DeleteFileHunk | UpdateFileHunk;

interface ParsedPatch {
  hunks: PatchHunk[];
}

interface AffectedPaths {
  added: string[];
  modified: string[];
  deleted: string[];
}

function toError(error: unknown): Error {
  return error instanceof Error ? error : new Error(String(error));
}

function normalizeLineEndings(text: string): string {
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function invalidPatch(message: string): Error {
  return new Error(`invalid patch: ${message}`);
}

function invalidHunk(message: string, lineNumber: number): Error {
  return new Error(`invalid hunk at line ${lineNumber}, ${message}`);
}

function checkStartAndEndLinesStrict(
  firstLine: string | undefined,
  lastLine: string | undefined
): void {
  const first = firstLine?.trim();
  const last = lastLine?.trim();

  if (first === BEGIN_PATCH_MARKER && last === END_PATCH_MARKER) {
    return;
  }
  if (first !== BEGIN_PATCH_MARKER) {
    throw invalidPatch("The first line of the patch must be '*** Begin Patch'");
  }
  throw invalidPatch("The last line of the patch must be '*** End Patch'");
}

function checkPatchBoundariesLenient(lines: string[], originalError: Error): string[] {
  const first = lines[0];
  const last = lines[lines.length - 1];
  if (
    first !== undefined &&
    last !== undefined &&
    (first === '<<EOF' || first === "<<'EOF'" || first === '<<"EOF"') &&
    last.endsWith('EOF') &&
    lines.length >= 4
  ) {
    const innerLines = lines.slice(1, -1);
    checkStartAndEndLinesStrict(innerLines[0], innerLines[innerLines.length - 1]);
    return innerLines;
  }

  throw originalError;
}

export function parseApplyPatch(input: string): ParsedPatch {
  const lines = normalizeLineEndings(input).trim().split('\n');
  let patchLines = lines;

  try {
    checkStartAndEndLinesStrict(lines[0], lines[lines.length - 1]);
  } catch (error) {
    patchLines = checkPatchBoundariesLenient(lines, toError(error));
  }

  const hunks: PatchHunk[] = [];
  let index = 1;
  let lineNumber = 2;
  const lastLineIndex = patchLines.length - 1;

  while (index < lastLineIndex) {
    const { hunk, parsedLines } = parseOneHunk(patchLines.slice(index, lastLineIndex), lineNumber);
    hunks.push(hunk);
    index += parsedLines;
    lineNumber += parsedLines;
  }

  return { hunks };
}

function parseOneHunk(
  lines: string[],
  lineNumber: number
): { hunk: PatchHunk; parsedLines: number } {
  const firstLine = lines[0]?.trim() ?? '';

  if (firstLine.startsWith(ADD_FILE_MARKER)) {
    const path = firstLine.slice(ADD_FILE_MARKER.length);
    let contents = '';
    let parsedLines = 1;
    for (const addLine of lines.slice(1)) {
      if (!addLine.startsWith('+')) {
        break;
      }
      contents += `${addLine.slice(1)}\n`;
      parsedLines += 1;
    }
    return { hunk: { type: 'add', path, contents }, parsedLines };
  }

  if (firstLine.startsWith(DELETE_FILE_MARKER)) {
    const path = firstLine.slice(DELETE_FILE_MARKER.length);
    return { hunk: { type: 'delete', path }, parsedLines: 1 };
  }

  if (firstLine.startsWith(UPDATE_FILE_MARKER)) {
    const path = firstLine.slice(UPDATE_FILE_MARKER.length);
    let remainingLines = lines.slice(1);
    let parsedLines = 1;

    const movePath = remainingLines[0]?.startsWith(MOVE_TO_MARKER)
      ? remainingLines[0].slice(MOVE_TO_MARKER.length)
      : undefined;
    if (movePath !== undefined) {
      remainingLines = remainingLines.slice(1);
      parsedLines += 1;
    }

    const chunks: UpdateFileChunk[] = [];
    while (remainingLines.length > 0) {
      const nextLine = remainingLines[0] ?? '';
      if (nextLine.trim() === '') {
        remainingLines = remainingLines.slice(1);
        parsedLines += 1;
        continue;
      }
      if (nextLine.startsWith('***')) {
        break;
      }

      const parsed = parseUpdateFileChunk(
        remainingLines,
        lineNumber + parsedLines,
        chunks.length === 0
      );
      chunks.push(parsed.chunk);
      remainingLines = remainingLines.slice(parsed.parsedLines);
      parsedLines += parsed.parsedLines;
    }

    if (chunks.length === 0) {
      throw invalidHunk(`Update file hunk for path '${path}' is empty`, lineNumber);
    }

    return {
      hunk: {
        type: 'update',
        path,
        ...(movePath !== undefined ? { movePath } : {}),
        chunks,
      },
      parsedLines,
    };
  }

  throw invalidHunk(
    `'${firstLine}' is not a valid hunk header. Valid hunk headers: '*** Add File: {path}', '*** Delete File: {path}', '*** Update File: {path}'`,
    lineNumber
  );
}

function parseUpdateFileChunk(
  lines: string[],
  lineNumber: number,
  allowMissingContext: boolean
): { chunk: UpdateFileChunk; parsedLines: number } {
  if (lines.length === 0) {
    throw invalidHunk(UPDATE_HUNK_EMPTY, lineNumber);
  }

  let changeContext: string | undefined;
  let startIndex = 0;
  const firstLine = lines[0] ?? '';
  if (firstLine === EMPTY_CHANGE_CONTEXT_MARKER) {
    startIndex = 1;
  } else if (firstLine.startsWith(CHANGE_CONTEXT_MARKER)) {
    changeContext = firstLine.slice(CHANGE_CONTEXT_MARKER.length);
    startIndex = 1;
  } else if (!allowMissingContext) {
    throw invalidHunk(
      `Expected update hunk to start with a @@ context marker, got: '${firstLine}'`,
      lineNumber
    );
  }

  if (startIndex >= lines.length) {
    throw invalidHunk(UPDATE_HUNK_EMPTY, lineNumber + 1);
  }

  const chunk: UpdateFileChunk = {
    ...(changeContext !== undefined ? { changeContext } : {}),
    oldLines: [],
    newLines: [],
    isEndOfFile: false,
  };
  let parsedLines = 0;

  for (const line of lines.slice(startIndex)) {
    if (line === EOF_MARKER) {
      if (parsedLines === 0) {
        throw invalidHunk(UPDATE_HUNK_EMPTY, lineNumber + 1);
      }
      chunk.isEndOfFile = true;
      parsedLines += 1;
      break;
    }

    const marker = line[0];
    if (marker === undefined) {
      chunk.oldLines.push('');
      chunk.newLines.push('');
    } else if (marker === ' ') {
      chunk.oldLines.push(line.slice(1));
      chunk.newLines.push(line.slice(1));
    } else if (marker === '+') {
      chunk.newLines.push(line.slice(1));
    } else if (marker === '-') {
      chunk.oldLines.push(line.slice(1));
    } else {
      if (parsedLines === 0) {
        throw invalidHunk(
          `Unexpected line found in update hunk: '${line}'. Every line should start with ' ' (context line), '+' (added line), or '-' (removed line)`,
          lineNumber + 1
        );
      }
      break;
    }

    parsedLines += 1;
  }

  return { chunk, parsedLines: parsedLines + startIndex };
}

function normalizeForFuzzyMatch(value: string): string {
  return value
    .trim()
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u2018-\u201B]/g, "'")
    .replace(/[\u201C-\u201F]/g, '"')
    .replace(/[\u00A0\u2002-\u200A\u202F\u205F\u3000]/g, ' ');
}

function seekSequence(
  lines: string[],
  pattern: string[],
  start: number,
  eof: boolean
): number | undefined {
  if (pattern.length === 0) {
    return start;
  }
  if (pattern.length > lines.length) {
    return undefined;
  }

  const searchStart = eof && lines.length >= pattern.length ? lines.length - pattern.length : start;
  const searchEnd = lines.length - pattern.length;

  for (let index = searchStart; index <= searchEnd; index += 1) {
    if (pattern.every((line, offset) => (lines[index + offset] ?? '') === line)) {
      return index;
    }
  }

  for (let index = searchStart; index <= searchEnd; index += 1) {
    if (
      pattern.every((line, offset) => (lines[index + offset] ?? '').trimEnd() === line.trimEnd())
    ) {
      return index;
    }
  }

  for (let index = searchStart; index <= searchEnd; index += 1) {
    if (pattern.every((line, offset) => (lines[index + offset] ?? '').trim() === line.trim())) {
      return index;
    }
  }

  for (let index = searchStart; index <= searchEnd; index += 1) {
    if (
      pattern.every(
        (line, offset) =>
          normalizeForFuzzyMatch(lines[index + offset] ?? '') === normalizeForFuzzyMatch(line)
      )
    ) {
      return index;
    }
  }

  return undefined;
}

function computeReplacements(
  originalLines: string[],
  path: string,
  chunks: UpdateFileChunk[]
): Array<[number, number, string[]]> {
  const replacements: Array<[number, number, string[]]> = [];
  let lineIndex = 0;

  for (const chunk of chunks) {
    if (chunk.changeContext !== undefined) {
      const contextIndex = seekSequence(originalLines, [chunk.changeContext], lineIndex, false);
      if (contextIndex === undefined) {
        throw new Error(`Failed to find context '${chunk.changeContext}' in ${path}`);
      }
      lineIndex = contextIndex + 1;
    }

    if (chunk.oldLines.length === 0) {
      const insertionIndex =
        originalLines[originalLines.length - 1] === ''
          ? originalLines.length - 1
          : originalLines.length;
      replacements.push([insertionIndex, 0, [...chunk.newLines]]);
      continue;
    }

    let pattern = chunk.oldLines;
    let newSlice = chunk.newLines;
    let found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);

    if (found === undefined && pattern[pattern.length - 1] === '') {
      pattern = pattern.slice(0, -1);
      if (newSlice[newSlice.length - 1] === '') {
        newSlice = newSlice.slice(0, -1);
      }
      found = seekSequence(originalLines, pattern, lineIndex, chunk.isEndOfFile);
    }

    if (found === undefined) {
      throw new Error(`Failed to find expected lines in ${path}:\n${chunk.oldLines.join('\n')}`);
    }

    replacements.push([found, pattern.length, [...newSlice]]);
    lineIndex = found + pattern.length;
  }

  replacements.sort(([left], [right]) => left - right);
  return replacements;
}

function applyReplacements(
  lines: string[],
  replacements: Array<[number, number, string[]]>
): string[] {
  const nextLines = [...lines];
  for (const [startIndex, oldLength, newSegment] of [...replacements].reverse()) {
    nextLines.splice(startIndex, oldLength, ...newSegment);
  }
  return nextLines;
}

async function deriveNewContentsFromChunks(
  path: string,
  chunks: UpdateFileChunk[],
  ops: ApplyPatchOperations
): Promise<string> {
  let originalContents: string;
  try {
    originalContents = await ops.readFile(path);
  } catch (error) {
    throw new Error(`Failed to read file to update ${path}: ${toError(error).message}`);
  }

  const originalLines = originalContents.split('\n');
  if (originalLines[originalLines.length - 1] === '') {
    originalLines.pop();
  }

  const replacements = computeReplacements(originalLines, path, chunks);
  const newLines = applyReplacements(originalLines, replacements);
  if (newLines[newLines.length - 1] !== '') {
    newLines.push('');
  }
  return newLines.join('\n');
}

async function mkdirForFile(path: string, ops: ApplyPatchOperations): Promise<void> {
  const dir = dirname(path);
  if (dir && dir !== '.') {
    await ops.mkdir(dir);
  }
}

async function applyHunks(
  hunks: PatchHunk[],
  cwd: string,
  ops: ApplyPatchOperations
): Promise<AffectedPaths> {
  if (hunks.length === 0) {
    throw new Error('No files were modified.');
  }

  const affected: AffectedPaths = { added: [], modified: [], deleted: [] };

  for (const hunk of hunks) {
    if (hunk.type === 'add') {
      const path = resolveToCwd(hunk.path, cwd);
      await mkdirForFile(path, ops);
      await ops.writeFile(path, hunk.contents);
      affected.added.push(path);
    } else if (hunk.type === 'delete') {
      const path = resolveToCwd(hunk.path, cwd);
      await ops.rm(path);
      affected.deleted.push(path);
    } else {
      const path = resolveToCwd(hunk.path, cwd);
      const newContents = await deriveNewContentsFromChunks(path, hunk.chunks, ops);
      if (hunk.movePath !== undefined) {
        const dest = resolveToCwd(hunk.movePath, cwd);
        await mkdirForFile(dest, ops);
        await ops.writeFile(dest, newContents);
        await ops.rm(path);
        affected.modified.push(dest);
      } else {
        await ops.writeFile(path, newContents);
        affected.modified.push(path);
      }
    }
  }

  return affected;
}

function printSummary(affected: AffectedPaths): string {
  const lines = ['Success. Updated the following files:'];
  for (const path of affected.added) {
    lines.push(`A ${path}`);
  }
  for (const path of affected.modified) {
    lines.push(`M ${path}`);
  }
  for (const path of affected.deleted) {
    lines.push(`D ${path}`);
  }
  return `${lines.join('\n')}\n`;
}

export function createApplyPatchTool(
  cwd: string,
  options?: ApplyPatchToolOptions
): AgentTool<typeof applyPatchSchema, ApplyPatchToolDetails> {
  const ops = options?.operations ?? defaultApplyPatchOperations;

  return {
    name: 'apply_patch',
    description:
      'Use the `apply_patch` tool to edit files. This is a FREEFORM tool, so do not wrap the patch in JSON.',
    parameters: applyPatchSchema,
    type: 'custom',
    format: {
      type: 'grammar',
      syntax: 'lark',
      definition: APPLY_PATCH_LARK_GRAMMAR,
    },
    execute: async ({ params, signal }) => {
      if (signal?.aborted) {
        throw new Error(OPERATION_ABORTED);
      }

      const parsed = parseApplyPatch(params.input);
      if (signal?.aborted) {
        throw new Error(OPERATION_ABORTED);
      }

      try {
        const affected = await applyHunks(parsed.hunks, cwd, ops);
        if (signal?.aborted) {
          throw new Error(OPERATION_ABORTED);
        }
        return {
          content: [{ type: 'text', content: printSummary(affected) }],
          details: affected,
        };
      } catch (error) {
        throw toError(error);
      }
    },
  } as AgentTool<typeof applyPatchSchema, ApplyPatchToolDetails>;
}

export const applyPatchTool = createApplyPatchTool(process.cwd());
