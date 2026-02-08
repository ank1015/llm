import { readMessage, writeMessage } from './stdio.js';

import type { ExtensionMessage, NativeResponse } from '../shared/message.types.js';

/**
 * Dispatches an incoming message and returns the appropriate response.
 */
function handleMessage(message: ExtensionMessage): NativeResponse {
  switch (message.type) {
    case 'ping':
      return { type: 'pong', requestId: message.requestId };

    case 'execute':
      // Placeholder: echo back the command and args
      return {
        type: 'success',
        requestId: message.requestId,
        data: {
          command: message.payload.command,
          args: message.payload.args,
          echo: true,
        },
      };

    default: {
      const exhaustive: never = message;
      return {
        type: 'error',
        requestId: (exhaustive as ExtensionMessage).requestId,
        error: `Unknown message type: ${(exhaustive as ExtensionMessage).type}`,
      };
    }
  }
}

/**
 * Main message loop: reads stdin, dispatches, writes stdout.
 * Isolates errors per message so one bad message doesn't crash the host.
 */
async function main(): Promise<never> {
  process.stderr.write(`[native-host] started (pid=${process.pid})\n`);

   
  while (true) {
    const message = await readMessage<ExtensionMessage>().catch((error: unknown) => {
      process.stderr.write(
        `[native-host] fatal read error: ${error instanceof Error ? error.message : String(error)}\n`
      );
      return process.exit(1) as never;
    });

    // Clean EOF — Chrome closed the connection
    if (message === null) {
      process.stderr.write('[native-host] stdin closed, exiting\n');
      process.exit(0);
    }

    try {
      const response = handleMessage(message);
      writeMessage(response);
    } catch (error) {
      // Per-message error isolation
      const errorResponse: NativeResponse = {
        type: 'error',
        requestId: message.requestId,
        error: error instanceof Error ? error.message : String(error),
      };
      writeMessage(errorResponse);
    }
  }
}

main();
