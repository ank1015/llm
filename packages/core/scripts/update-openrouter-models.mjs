#!/usr/bin/env node
/**
 * Fetches models from the OpenRouter API and updates openrouter.ts.
 *
 * Usage:
 *   OPENROUTER_API_KEY=sk-or-... node scripts/update-openrouter-models.mjs
 *
 * Flags:
 *   --dry-run   Print the generated file to stdout instead of writing it.
 */

import { writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

// ── Config ──────────────────────────────────────────────────────────

const API_URL = "https://openrouter.ai/api/v1/models";
const __dirname = dirname(fileURLToPath(import.meta.url));
const OUTPUT_PATH = resolve(__dirname, "../src/models/openrouter.ts");

// Models to exclude (free / broken / not useful).
const SKIP_IDS = new Set([
	// "openai/gpt-3.5-turbo",
]);

// ── Helpers ─────────────────────────────────────────────────────────

function mapInputModalities(modalities) {
	const mapped = [];
	if (modalities.includes("text")) mapped.push("text");
	if (modalities.includes("image")) mapped.push("image");
	if (modalities.includes("file")) mapped.push("file");
	return mapped.length > 0 ? mapped : ["text"];
}

function hasToolSupport(params) {
	return params.includes("tools") || params.includes("tool_choice");
}

function hasReasoning(params) {
	return params.includes("reasoning");
}

/** Convert per-token price string to per-million-token number. */
function toPerMillion(perToken) {
	const val = parseFloat(perToken) * 1_000_000;
	// Round to avoid floating-point noise
	return Math.round(val * 1_000_000) / 1_000_000;
}

function indent(text, level) {
	return "\t".repeat(level) + text;
}

// ── Main ────────────────────────────────────────────────────────────

async function main() {
	const apiKey = process.env.OPENROUTER_API_KEY;
	if (!apiKey) {
		console.error("Error: OPENROUTER_API_KEY environment variable is required.");
		console.error("Usage: OPENROUTER_API_KEY=sk-or-... node scripts/update-openrouter-models.mjs");
		process.exit(1);
	}

	const dryRun = process.argv.includes("--dry-run");

	console.error("Fetching models from OpenRouter...");
	const res = await fetch(API_URL, {
		headers: { Authorization: `Bearer ${apiKey}` },
	});

	if (!res.ok) {
		console.error(`API request failed: ${res.status} ${res.statusText}`);
		process.exit(1);
	}

	const json = await res.json();
	const models = json.data;

	console.error(`Fetched ${models.length} models from OpenRouter.`);

	// Filter: skip free models (prompt=0 && completion=0), skip SKIP_IDS
	const filtered = models.filter((m) => {
		if (SKIP_IDS.has(m.id)) return false;
		const promptCost = parseFloat(m.pricing.prompt);
		const completionCost = parseFloat(m.pricing.completion);
		if (promptCost === 0 && completionCost === 0) return false;
		return true;
	});

	console.error(`${filtered.length} models after filtering (excluded ${models.length - filtered.length} free/skipped).`);

	// Sort by id for stable output
	filtered.sort((a, b) => a.id.localeCompare(b.id));

	// Build file content
	const lines = [];
	lines.push('import type { Model } from "@ank1015/llm-types";');
	lines.push("");
	lines.push("const openrouterBaseUrl = `https://openrouter.ai/api/v1`;");
	lines.push("");
	lines.push("export const openrouterModels = {");

	for (const m of filtered) {
		const inputCost = toPerMillion(m.pricing.prompt);
		const outputCost = toPerMillion(m.pricing.completion);
		const inputModalities = mapInputModalities(m.architecture.input_modalities);
		const tools = hasToolSupport(m.supported_parameters) ? '["function_calling"]' : "[]";
		const reasoning = hasReasoning(m.supported_parameters);
		const maxTokens = m.top_provider.max_completion_tokens ?? 4096;
		const contextWindow = m.context_length;

		// Escape any quotes in the model name
		const safeName = m.name.replace(/"/g, '\\"');

		lines.push(indent(`"${m.id}": {`, 1));
		lines.push(indent(`id: "${m.id}",`, 2));
		lines.push(indent(`name: "${safeName}",`, 2));
		lines.push(indent(`api: "openrouter",`, 2));
		lines.push(indent(`baseUrl: openrouterBaseUrl,`, 2));
		lines.push(indent(`reasoning: ${reasoning},`, 2));
		lines.push(indent(`input: [${inputModalities.map((i) => `"${i}"`).join(", ")}],`, 2));
		lines.push(indent(`cost: {`, 2));
		lines.push(indent(`input: ${inputCost},`, 3));
		lines.push(indent(`output: ${outputCost},`, 3));
		lines.push(indent(`cacheRead: 0,`, 3));
		lines.push(indent(`cacheWrite: 0,`, 3));
		lines.push(indent(`},`, 2));
		lines.push(indent(`contextWindow: ${contextWindow},`, 2));
		lines.push(indent(`maxTokens: ${maxTokens},`, 2));
		lines.push(indent(`tools: ${tools},`, 2));
		lines.push(indent(`} satisfies Model<"openrouter">,`, 1));
	}

	lines.push("};");
	lines.push("");

	const content = lines.join("\n");

	if (dryRun) {
		console.error("\n--- DRY RUN ---\n");
		process.stdout.write(content);
	} else {
		writeFileSync(OUTPUT_PATH, content, "utf-8");
		console.error(`Wrote ${filtered.length} models to ${OUTPUT_PATH}`);
	}
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
