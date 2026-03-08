#!/usr/bin/env node

function printHelp() {
  process.stdout.write(`Usage: node .max/skills/llm-use/scripts/complete-once.mjs --prompt "Your prompt" [options]

Send one prompt through @ank1015/llm-sdk and print the normalized assistant text.

Options:
  --api <name>         Provider API (default: openai)
  --model <id>         Model ID (default: gpt-5-mini)
  --prompt <text>      User prompt to send
  --system <text>      Optional system prompt
  --keys-dir <path>    Optional file-keys adapter directory
  --json               Print structured JSON instead of plain text
  --help               Show this help text

Examples:
  node .max/skills/llm-use/scripts/complete-once.mjs --prompt "Summarize this diff."
  node .max/skills/llm-use/scripts/complete-once.mjs --api anthropic --model claude-sonnet-4-5 --prompt "Draft a release note." --json
`);
}

function parseArgs(argv) {
  const options = {
    api: 'openai',
    model: 'gpt-5-mini',
    prompt: '',
    system: '',
    keysDir: undefined,
    json: false,
    help: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (
      arg === '--api' ||
      arg === '--model' ||
      arg === '--prompt' ||
      arg === '--system' ||
      arg === '--keys-dir'
    ) {
      const value = argv[index + 1];
      if (!value) {
        throw new Error(`Missing value for ${arg}`);
      }

      if (arg === '--api') {
        options.api = value;
      } else if (arg === '--model') {
        options.model = value;
      } else if (arg === '--prompt') {
        options.prompt = value;
      } else if (arg === '--system') {
        options.system = value;
      } else if (arg === '--keys-dir') {
        options.keysDir = value;
      }

      index += 1;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return options;
}

function getAssistantText(message) {
  const lines = [];

  for (const block of message.content ?? []) {
    if (block.type !== 'response') {
      continue;
    }

    for (const part of block.content ?? []) {
      if (part.type === 'text' && typeof part.content === 'string') {
        lines.push(part.content);
      }
    }
  }

  return lines.join('\n').trim();
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    process.exit(0);
  }

  if (!options.prompt) {
    throw new Error('--prompt is required');
  }

  const [{ complete, getModel }, { createFileKeysAdapter }] = await Promise.all([
    import('@ank1015/llm-sdk'),
    import('@ank1015/llm-sdk-adapters'),
  ]);

  const model = getModel(options.api, options.model);
  if (!model) {
    throw new Error(`Model "${options.model}" not found for API "${options.api}"`);
  }

  const keysAdapter = createFileKeysAdapter(options.keysDir);
  const context = {
    ...(options.system ? { systemPrompt: options.system } : {}),
    messages: [
      {
        role: 'user',
        id: `user-${Date.now()}`,
        content: [{ type: 'text', content: options.prompt }],
      },
    ],
  };

  const message = await complete(model, context, { keysAdapter });
  const text = getAssistantText(message);

  if (options.json) {
    process.stdout.write(
      `${JSON.stringify(
        {
          api: options.api,
          model: options.model,
          text,
        },
        null,
        2
      )}\n`
    );
  } else {
    process.stdout.write(`${text}\n`);
  }

  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`Error: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
