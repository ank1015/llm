/**
 * Message routes
 *
 * Endpoints for /messages/complete and /messages/stream
 */

import { complete, stream, getModel, isContextOverflow } from '@ank1015/llm-core';
import {
  ApiKeyNotFoundError,
  ModelNotFoundError,
  InvalidRequestError,
  ProviderError,
  ContextOverflowError,
  LLMError,
} from '@ank1015/llm-types';
import { Hono } from 'hono';
import { streamSSE } from 'hono/streaming';

import { KeyService, DbService } from '../services/index.js';

import type { Api, MessageRequest, Context } from '@ank1015/llm-types';

const app = new Hono();

/**
 * Validate request body and extract required fields.
 */
function validateRequest(body: unknown): MessageRequest {
  if (!body || typeof body !== 'object') {
    throw new InvalidRequestError('Request body is required');
  }

  const req = body as Record<string, unknown>;

  if (!req['api'] || typeof req['api'] !== 'string') {
    throw new InvalidRequestError('api is required and must be a string');
  }

  if (!req['modelId'] || typeof req['modelId'] !== 'string') {
    throw new InvalidRequestError('modelId is required and must be a string');
  }

  if (!req['messages'] || !Array.isArray(req['messages'])) {
    throw new InvalidRequestError('messages is required and must be an array');
  }

  return req as unknown as MessageRequest;
}

/**
 * Generate a unique request ID.
 */
function generateRequestId(): string {
  return `msg-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * POST /messages/complete
 *
 * Non-streaming completion endpoint.
 */
app.post('/complete', async (c) => {
  try {
    const body = await c.req.json();
    const request = validateRequest(body);

    // Get API key
    const apiKey = KeyService.getKey(request.api as Api);
    if (!apiKey) {
      throw new ApiKeyNotFoundError(request.api);
    }

    // Get model
    const model = getModel(request.api as Api, request.modelId as never);
    if (!model) {
      throw new ModelNotFoundError(request.api, request.modelId);
    }

    // Build context
    const context: Context = {
      messages: request.messages,
    };
    if (request.systemPrompt) {
      context.systemPrompt = request.systemPrompt;
    }
    if (request.tools) {
      context.tools = request.tools;
    }

    // Build options
    const options = {
      ...request.providerOptions,
      apiKey,
    };

    // Generate request ID
    const id = generateRequestId();

    // Call complete function
    const response = await complete(model, context, options as never, id);

    // Check for context overflow
    if (isContextOverflow(response, model.contextWindow)) {
      throw new ContextOverflowError(request.api, response.usage.input, model.contextWindow);
    }

    // Save to database
    DbService.saveMessage(response);

    // Return response
    return c.json(response);
  } catch (error) {
    if (error instanceof LLMError) {
      return c.json(
        error.toResponse(),
        error.statusCode as 400 | 401 | 404 | 413 | 429 | 500 | 502
      );
    }

    // Handle provider errors
    const message = error instanceof Error ? error.message : String(error);
    const providerError = new ProviderError('unknown', message);
    return c.json(providerError.toResponse(), 502);
  }
});

/**
 * POST /messages/stream
 *
 * Streaming completion endpoint using SSE.
 */
app.post('/stream', async (c) => {
  try {
    const body = await c.req.json();
    const request = validateRequest(body);

    // Get API key
    const apiKey = KeyService.getKey(request.api as Api);
    if (!apiKey) {
      throw new ApiKeyNotFoundError(request.api);
    }

    // Get model
    const model = getModel(request.api as Api, request.modelId as never);
    if (!model) {
      throw new ModelNotFoundError(request.api, request.modelId);
    }

    // Build context
    const context: Context = {
      messages: request.messages,
    };
    if (request.systemPrompt) {
      context.systemPrompt = request.systemPrompt;
    }
    if (request.tools) {
      context.tools = request.tools;
    }

    // Build options
    const options = {
      ...request.providerOptions,
      apiKey,
    };

    // Generate request ID
    const id = generateRequestId();

    // Start streaming
    const eventStream = stream(model, context, options as never, id);

    return streamSSE(c, async (sseStream) => {
      try {
        // Stream events
        for await (const event of eventStream) {
          await sseStream.writeSSE({
            event: event.type,
            data: JSON.stringify(event),
          });
        }

        // Get final result
        const finalMessage = await eventStream.result();

        // Check for context overflow
        if (isContextOverflow(finalMessage, model.contextWindow)) {
          await sseStream.writeSSE({
            event: 'error',
            data: JSON.stringify(
              new ContextOverflowError(
                request.api,
                finalMessage.usage.input,
                model.contextWindow
              ).toResponse()
            ),
          });
        }

        // Save to database
        DbService.saveMessage(finalMessage);

        // Send final message
        await sseStream.writeSSE({
          event: 'message',
          data: JSON.stringify(finalMessage),
        });
      } catch (streamError) {
        const message = streamError instanceof Error ? streamError.message : String(streamError);
        await sseStream.writeSSE({
          event: 'error',
          data: JSON.stringify(new ProviderError(request.api, message).toResponse()),
        });
      }
    });
  } catch (error) {
    if (error instanceof LLMError) {
      return c.json(
        error.toResponse(),
        error.statusCode as 400 | 401 | 404 | 413 | 429 | 500 | 502
      );
    }

    const message = error instanceof Error ? error.message : String(error);
    const providerError = new ProviderError('unknown', message);
    return c.json(providerError.toResponse(), 502);
  }
});

export { app as messagesRoutes };
