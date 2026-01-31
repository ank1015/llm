/**
 * @ank1015/llm-server
 *
 * HTTP server for LLM SDK built with Hono.
 */

import { Hono } from "hono";

// Services
export { KeyService, DbService } from "./services/index.js";

// Routes
import { messagesRoutes } from "./routes/index.js";

export const app = new Hono();

// Health check endpoint
app.get("/health", (c) => {
	return c.json({ status: "ok", timestamp: new Date().toISOString() });
});

// Mount routes
app.route("/messages", messagesRoutes);

// Default export for direct execution
export default app;
