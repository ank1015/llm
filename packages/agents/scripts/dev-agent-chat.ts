#!/usr/bin/env tsx

import { mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import process from 'node:process';
import { createInterface } from 'node:readline/promises';

import { agent, getText, userMessage } from '@ank1015/llm-sdk';

import { createApplyPatchTool } from '../src/tools/apply-patch.js';
import { createBashTool } from '../src/tools/bash.js';

import type { AgentEvent, AgentResult, AgentTool } from '@ank1015/llm-sdk';

const MODEL_ID = 'azure-openai/gpt-5.4';
const REASONING_EFFORT = 'medium';
const BRANCH = 'main';
const SESSION_FILE_NAME = '.llm-agent-session.jsonl';

const SYSTEM_PROMPT = 'You are a coding agent. Use the tools to accomplish the user tasks.';

function createCliTools(agentCwd: string): AgentTool[] {
  return [createBashTool(agentCwd), createApplyPatchTool(agentCwd)] as unknown as AgentTool[];
}

function printUsage(): void {
  writeOut(`Usage: pnpm --filter @ank1015/llm-agents dev:agent-chat -- [agent-cwd]

Starts a developer-only chat CLI backed by SDK agent().

Arguments:
  agent-cwd   Directory where tools are initialized. Defaults to process.cwd().

Session:
  The CLI stores and resumes JSONL history at <agent-cwd>/${SESSION_FILE_NAME}.

Edit this script to customize MODEL_ID, REASONING_EFFORT, SYSTEM_PROMPT, or createCliTools().
`);
}

function getAgentCwd(argv: string[]): string | null {
  const args = argv.filter((arg) => arg !== '--');
  if (args.includes('--help') || args.includes('-h')) {
    return null;
  }
  if (args.length > 1) {
    throw new Error(`Expected at most one agent-cwd argument, received ${args.length}.`);
  }
  return resolve(args[0] ?? process.cwd());
}

function writeOut(text: string): void {
  process.stdout.write(text);
}

function writeErr(text: string): void {
  process.stderr.write(text);
}

function ensurePromptLineBreak(state: { lineOpen: boolean }): void {
  if (!state.lineOpen) {
    return;
  }
  writeOut('\n');
  state.lineOpen = false;
}

function formatUnknownError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isReadlineClosedError(error: unknown): boolean {
  return error instanceof Error && error.message === 'readline was closed';
}

function handleAgentEvent(
  event: AgentEvent,
  streamState: { didStreamText: boolean; lineOpen: boolean }
): void {
  if (event.type === 'message_update' && event.messageType === 'assistant') {
    const messageEvent = event.message;
    if ('type' in messageEvent && messageEvent.type === 'text_delta') {
      writeOut(messageEvent.delta);
      streamState.didStreamText = true;
      streamState.lineOpen = true;
    }
    return;
  }

  if (event.type === 'tool_execution_start') {
    ensurePromptLineBreak(streamState);
    writeOut(`[tool:start] ${event.toolName}\n`);
    return;
  }

  if (event.type === 'tool_execution_end') {
    ensurePromptLineBreak(streamState);
    writeOut(`[tool:end] ${event.toolName} ${event.isError ? 'error' : 'ok'}\n`);
  }
}

async function runTurn(input: {
  message: string;
  sessionPath: string;
  agentCwd: string;
  currentHeadId: string | undefined;
  signal: AbortSignal;
}): Promise<AgentResult> {
  const run = agent({
    modelId: MODEL_ID,
    reasoningEffort: REASONING_EFFORT,
    system: SYSTEM_PROMPT,
    tools: createCliTools(input.agentCwd),
    inputMessages: [userMessage(input.message)],
    maxTurns: Number.MAX_SAFE_INTEGER,
    signal: input.signal,
    session: {
      path: input.sessionPath,
      branch: BRANCH,
      ...(input.currentHeadId !== undefined ? { headId: input.currentHeadId } : {}),
    },
  });

  const streamState = { didStreamText: false, lineOpen: false };
  for await (const event of run) {
    handleAgentEvent(event, streamState);
  }

  const result = await run;
  if (streamState.lineOpen) {
    writeOut('\n');
  }

  if (result.ok && !streamState.didStreamText) {
    const finalText = getText(result.finalAssistantMessage).trim();
    if (finalText) {
      writeOut(`${finalText}\n`);
    }
  }

  return result;
}

async function main(): Promise<void> {
  const agentCwd = getAgentCwd(process.argv.slice(2));
  if (agentCwd === null) {
    printUsage();
    return;
  }

  await mkdir(agentCwd, { recursive: true });

  const sessionPath = join(agentCwd, SESSION_FILE_NAME);
  const rl = createInterface({
    input: process.stdin,
    output: process.stdout,
    terminal: true,
  });

  let currentHeadId: string | undefined;
  let activeAbortController: AbortController | undefined;
  let exitRequested = false;

  const requestExit = (): void => {
    if (activeAbortController) {
      if (!exitRequested) {
        writeOut('\nAborting active run...\n');
      }
      exitRequested = true;
      activeAbortController.abort();
      return;
    }

    exitRequested = true;
    rl.close();
  };

  process.on('SIGINT', requestExit);

  writeOut(`Agent cwd: ${agentCwd}\n`);
  writeOut(`Session: ${sessionPath}\n`);
  writeOut(`Model: ${MODEL_ID} (${REASONING_EFFORT} reasoning)\n`);
  writeOut("Type 'exit' or press Ctrl-C to quit.\n");

  try {
    while (!exitRequested) {
      let prompt: string;
      try {
        prompt = await rl.question('\nuser> ');
      } catch (error) {
        if (exitRequested || isReadlineClosedError(error)) {
          break;
        }
        throw error;
      }

      const trimmed = prompt.trim();
      if (!trimmed) {
        continue;
      }
      if (trimmed === 'exit' || trimmed === 'quit') {
        break;
      }

      activeAbortController = new AbortController();
      try {
        const result = await runTurn({
          message: trimmed,
          sessionPath,
          agentCwd,
          currentHeadId,
          signal: activeAbortController.signal,
        });

        if (result.headId) {
          currentHeadId = result.headId;
        }

        if (!result.ok) {
          writeErr(`[agent:${result.error.phase}] ${result.error.message}\n`);
          if (result.error.phase === 'aborted' && exitRequested) {
            break;
          }
        }
      } catch (error) {
        if (activeAbortController.signal.aborted && exitRequested) {
          writeOut('Run aborted.\n');
          break;
        }
        writeErr(`[agent:error] ${formatUnknownError(error)}\n`);
      } finally {
        activeAbortController = undefined;
      }
    }
  } finally {
    process.off('SIGINT', requestExit);
    rl.close();
    writeOut(`Session path: ${sessionPath}\n`);
  }
}

void main().catch((error: unknown) => {
  writeErr(`${formatUnknownError(error)}\n`);
  process.exitCode = 1;
});
