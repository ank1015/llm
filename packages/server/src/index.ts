/**
 * @ank1015/llm-server
 *
 * HTTP server for LLM SDK built with Hono.
 */

import { Hono } from "hono";

export const app = new Hono();

// Health check endpoint
app.get("/health", (c) => {
	return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Default export for direct execution
export default app;
