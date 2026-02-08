import { runAgentPrompt, loadSessionMessages } from './agent.js';
import { MessageDispatcher } from './dispatcher.js';

import type { PromptArgs } from './agent.js';
import type { ExecuteMessage, ExtensionMessage } from '../shared/message.types.js';

function log(msg: string): void {
  process.stderr.write(`[native-host] ${msg}\n`);
}

async function handleExecute(
  message: ExecuteMessage,
  dispatcher: MessageDispatcher
): Promise<void> {
  try {
    const { command, args } = message.payload;

    switch (command) {
      case 'prompt': {
        const promptArgs = args as PromptArgs | undefined;
        if (!promptArgs?.message || !promptArgs.tabId || !promptArgs.api || !promptArgs.modelId) {
          dispatcher.send({
            type: 'error',
            requestId: message.requestId,
            error: 'Missing required fields: message, tabId, api, modelId',
          });
          return;
        }

        const result = await runAgentPrompt(promptArgs, dispatcher, message.requestId);
        dispatcher.send({
          type: 'success',
          requestId: message.requestId,
          data: result,
        });
        break;
      }

      case 'loadSession': {
        const sessionArgs = args as { sessionId?: string } | undefined;
        if (!sessionArgs?.sessionId) {
          dispatcher.send({
            type: 'error',
            requestId: message.requestId,
            error: 'Missing required field: sessionId',
          });
          return;
        }

        const result = await loadSessionMessages(sessionArgs.sessionId);
        dispatcher.send({
          type: 'success',
          requestId: message.requestId,
          data: result,
        });
        break;
      }

      default:
        dispatcher.send({
          type: 'error',
          requestId: message.requestId,
          error: `Unknown command: ${command}`,
        });
    }
  } catch (error) {
    log(`execute error: ${error instanceof Error ? error.message : String(error)}`);
    dispatcher.send({
      type: 'error',
      requestId: message.requestId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function main(): Promise<void> {
  log(`started (pid=${process.pid})`);

  const dispatcher = new MessageDispatcher();

  await dispatcher.run((message: ExtensionMessage) => {
    switch (message.type) {
      case 'ping':
        dispatcher.send({ type: 'pong', requestId: message.requestId });
        break;

      case 'execute':
        // Fire-and-forget — dispatcher keeps reading while agent runs
        handleExecute(message, dispatcher);
        break;
    }
  });

  log('stdin closed, exiting');
}

main().catch((error) => {
  log(`fatal: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(1);
});
