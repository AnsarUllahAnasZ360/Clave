import { createGoogleChatAdapter } from "@chat-adapter/gchat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { Chat } from "chat";

// TODO: Production state adapter — replace createMemoryState() with:
// import { createRedisState } from "@chat-adapter/state-redis";
// state: createRedisState({ url: process.env.REDIS_URL, keyPrefix: "clave-chat-sdk" }),
// Upstash Redis (already in deps as @upstash/redis) works with the REST-compatible URL.

let _bot: Chat | null = null;
let _handlersRegistered = false;

/**
 * Returns the Chat SDK bot singleton, lazily initialized.
 * Lazy init avoids throwing during Next.js build when GOOGLE_CHAT_CREDENTIALS
 * is not available in the build environment.
 */
export function getBot(): Chat {
	if (!_bot) {
		_bot = new Chat({
			userName: "clave",
			adapters: {
				gchat: createGoogleChatAdapter(),
			},
			state: createMemoryState(),
		});
	}
	return _bot;
}

/**
 * Ensure handlers are registered on the bot singleton.
 * Must be called (and awaited) before processing webhook events.
 * We initialize the bot first, then import handlers which call getBot()
 * to get the same instance.
 */
export async function ensureHandlers(): Promise<void> {
	if (_handlersRegistered) return;
	// Ensure bot is created before handlers try to access it
	getBot();
	try {
		await import("./handlers");
		_handlersRegistered = true;
	} catch (e) {
		console.error("[chat-sdk] Failed to register handlers:", e);
	}
}
