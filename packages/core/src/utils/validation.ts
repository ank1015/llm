import AjvModule from 'ajv';
import addFormatsModule from 'ajv-formats';

import type { Tool, AssistantToolCall } from '@ank1015/llm-types';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Handle both default and named exports (CJS/ESM interop)
const Ajv = (AjvModule as any).default || AjvModule;
const addFormats = (addFormatsModule as any).default || addFormatsModule;

// Detect if we're in a browser extension environment with strict CSP
// Chrome extensions with Manifest V3 don't allow eval/Function constructor
const isBrowserExtension =
  typeof globalThis !== 'undefined' && (globalThis as any).chrome?.runtime?.id !== undefined;

// Create a singleton AJV instance with formats (only if not in browser extension)
// AJV requires 'unsafe-eval' CSP which is not allowed in Manifest V3
let ajv: any = null;
/* eslint-enable @typescript-eslint/no-explicit-any */
if (!isBrowserExtension) {
  try {
    ajv = new Ajv({
      allErrors: true,
      strict: false,
    });
    addFormats(ajv);
  } catch (e) {
    // AJV initialization failed (likely CSP restriction)
    console.warn('AJV validation disabled due to CSP restrictions');
  }
}

// Cache compiled validators keyed on the schema object reference.
// Tool schemas are created once and reused, so this avoids repeated ajv.compile() calls.
const validatorCache = new WeakMap<object, ReturnType<typeof ajv.compile>>();

// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function getValidator(schema: object) {
  let validate = validatorCache.get(schema);
  if (!validate) {
    validate = ajv.compile(schema);
    validatorCache.set(schema, validate);
  }
  return validate;
}

/**
 * Finds a tool by name and validates the tool call arguments against its TypeBox schema
 * @param tools Array of tool definitions
 * @param toolCall The tool call from the LLM
 * @returns The validated arguments
 * @throws Error if tool is not found or validation fails
 */
export function validateToolCall(
  tools: Tool[],
  toolCall: AssistantToolCall
): Record<string, unknown> {
  const tool = tools.find((t) => t.name === toolCall.name);
  if (!tool) {
    throw new Error(`Tool "${toolCall.name}" not found`);
  }
  return validateToolArguments(tool, toolCall);
}

/**
 * Validates tool call arguments against the tool's TypeBox schema
 * @param tool The tool definition with TypeBox schema
 * @param toolCall The tool call from the LLM
 * @returns The validated arguments
 * @throws Error with formatted message if validation fails
 */
export function validateToolArguments(
  tool: Tool,
  toolCall: AssistantToolCall
): Record<string, unknown> {
  // Skip validation in browser extension environment (CSP restrictions prevent AJV from working)
  if (!ajv || isBrowserExtension) {
    // Trust the LLM's output without validation
    // Browser extensions can't use AJV due to Manifest V3 CSP restrictions
    return toolCall.arguments;
  }

  // Get or compile the schema validator (cached)
  const validate = getValidator(tool.parameters);

  // Validate the arguments
  if (validate(toolCall.arguments)) {
    return toolCall.arguments;
  }

  // Format validation errors nicely
  const errors =
    validate.errors
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ?.map((err: any) => {
        const path = err.instancePath
          ? err.instancePath.substring(1)
          : err.params.missingProperty || 'root';
        return `  - ${path}: ${err.message}`;
      })
      .join('\n') || 'Unknown validation error';

  const errorMessage = `Validation failed for tool "${toolCall.name}":\n${errors}\n\nReceived arguments:\n${JSON.stringify(toolCall.arguments, null, 2)}`;

  throw new Error(errorMessage);
}
