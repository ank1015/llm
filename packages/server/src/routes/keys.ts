/**
 * API Keys routes
 *
 * Endpoints for managing API keys for different providers.
 */

import { Hono } from "hono";
import { isValidApi } from "@ank1015/llm-types";
import type { Api } from "@ank1015/llm-types";
import { InvalidRequestError, LLMError } from "@ank1015/llm-types";
import { KeyService } from "../services/index.js";

const app = new Hono();

/**
 * GET /keys
 *
 * List all providers with stored API keys.
 */
app.get("/", (c) => {
	const providers = KeyService.listProviders();
	return c.json({
		providers,
		count: providers.length,
	});
});

/**
 * GET /keys/:api
 *
 * Check if an API key exists for a provider (does not return the key).
 */
app.get("/:api", (c) => {
	const api = c.req.param("api");

	if (!isValidApi(api)) {
		const error = new InvalidRequestError(`Invalid API provider: ${api}`, { api });
		return c.json(error.toResponse(), 400);
	}

	const hasKey = KeyService.hasKey(api as Api);

	return c.json({
		api,
		exists: hasKey,
	});
});

/**
 * POST /keys/:api
 *
 * Add or update an API key for a provider.
 */
app.post("/:api", async (c) => {
	try {
		const api = c.req.param("api");

		if (!isValidApi(api)) {
			throw new InvalidRequestError(`Invalid API provider: ${api}`, { api });
		}

		const body = await c.req.json();

		if (!body || typeof body !== "object") {
			throw new InvalidRequestError("Request body is required");
		}

		const { apiKey } = body as { apiKey?: string };

		if (!apiKey || typeof apiKey !== "string") {
			throw new InvalidRequestError("apiKey is required and must be a string");
		}

		if (apiKey.trim().length === 0) {
			throw new InvalidRequestError("apiKey cannot be empty");
		}

		KeyService.setKey(api as Api, apiKey);

		return c.json({
			success: true,
			api,
			message: `API key for ${api} has been saved`,
		});
	} catch (error) {
		if (error instanceof LLMError) {
			return c.json(error.toResponse(), error.statusCode as 400);
		}

		const message = error instanceof Error ? error.message : String(error);
		const internalError = new InvalidRequestError(message);
		return c.json(internalError.toResponse(), 400);
	}
});

/**
 * PUT /keys/:api
 *
 * Update an API key for a provider (alias for POST).
 */
app.put("/:api", async (c) => {
	try {
		const api = c.req.param("api");

		if (!isValidApi(api)) {
			throw new InvalidRequestError(`Invalid API provider: ${api}`, { api });
		}

		const body = await c.req.json();

		if (!body || typeof body !== "object") {
			throw new InvalidRequestError("Request body is required");
		}

		const { apiKey } = body as { apiKey?: string };

		if (!apiKey || typeof apiKey !== "string") {
			throw new InvalidRequestError("apiKey is required and must be a string");
		}

		if (apiKey.trim().length === 0) {
			throw new InvalidRequestError("apiKey cannot be empty");
		}

		const existed = KeyService.hasKey(api as Api);
		KeyService.setKey(api as Api, apiKey);

		return c.json({
			success: true,
			api,
			message: existed ? `API key for ${api} has been updated` : `API key for ${api} has been created`,
		});
	} catch (error) {
		if (error instanceof LLMError) {
			return c.json(error.toResponse(), error.statusCode as 400);
		}

		const message = error instanceof Error ? error.message : String(error);
		const internalError = new InvalidRequestError(message);
		return c.json(internalError.toResponse(), 400);
	}
});

/**
 * DELETE /keys/:api
 *
 * Remove an API key for a provider.
 */
app.delete("/:api", (c) => {
	const api = c.req.param("api");

	if (!isValidApi(api)) {
		const error = new InvalidRequestError(`Invalid API provider: ${api}`, { api });
		return c.json(error.toResponse(), 400);
	}

	const removed = KeyService.removeKey(api as Api);

	if (!removed) {
		return c.json({
			success: false,
			api,
			message: `No API key found for ${api}`,
		}, 404);
	}

	return c.json({
		success: true,
		api,
		message: `API key for ${api} has been removed`,
	});
});

export { app as keysRoutes };
