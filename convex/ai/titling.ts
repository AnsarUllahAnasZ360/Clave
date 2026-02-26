"use node";

import { generateText } from "ai";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { internalAction } from "../_generated/server";
import { chatModel } from "./providers";

// ── Thread Auto-Titling ──────────────────────────────────────────────────────
//
// Runs asynchronously (via ctx.scheduler.runAfter) after the first assistant
// response in a new thread. Generates a 2-5 word title from the user's first
// message and updates the aiThreads record. Retries once on failure, then
// falls back to the first 60 characters of the user's message.

const TITLING_PROMPT = `Generate a 2-5 word title for this conversation. Reply with ONLY the title, no quotes, no punctuation, no explanation.

Conversation: `;

const RETRY_DELAY_MS = 3000;
const FALLBACK_MAX_LENGTH = 60;

function cleanTitle(raw: string): string {
	return raw
		.trim()
		.replace(/^["'`]|["'`]$/g, "")
		.split("\n")[0]
		.trim();
}

async function attemptGenerateTitle(prompt: string): Promise<string | null> {
	const result = await generateText({
		model: chatModel(),
		prompt: TITLING_PROMPT + prompt,
	});
	const title = cleanTitle(result.text ?? "");
	return title || null;
}

function makeFallbackTitle(prompt: string): string {
	const trimmed = prompt.trim();
	if (trimmed.length <= FALLBACK_MAX_LENGTH) return trimmed;
	return `${trimmed.slice(0, FALLBACK_MAX_LENGTH).trim()}\u2026`;
}

export const generateThreadTitle = internalAction({
	args: {
		threadId: v.string(),
		prompt: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, { threadId, prompt }) => {
		try {
			// Attempt 1: AI title generation
			let title: string | null = null;
			try {
				title = await attemptGenerateTitle(prompt);
			} catch (error) {
				console.error("[titling] Attempt 1 failed:", error);
			}

			// Attempt 2: Retry after delay
			if (!title) {
				await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
				try {
					title = await attemptGenerateTitle(prompt);
				} catch (error) {
					console.error("[titling] Attempt 2 failed:", error);
				}
			}

			// Fallback: first 60 chars of user message
			if (!title) {
				title = makeFallbackTitle(prompt);
				console.warn(`[titling] Using fallback title for thread ${threadId}`);
			}

			if (title) {
				await ctx.runMutation(internal.ai.threads.internalSetThreadTitle, {
					threadId,
					title,
				});
			}
		} catch (error) {
			// Last resort: never crash the background job
			console.error("[titling] Failed to generate thread title:", error);
		}

		return null;
	},
});
