import { createGoogleChatAdapter } from "@chat-adapter/gchat";
import { createMemoryState } from "@chat-adapter/state-memory";
import { Chat } from "chat";

// TODO: Production state adapter — replace createMemoryState() with:
// import { createRedisState } from "@chat-adapter/state-redis";
// state: createRedisState({ url: process.env.REDIS_URL, keyPrefix: "clave-chat-sdk" }),
// Upstash Redis (already in deps as @upstash/redis) works with the REST-compatible URL.

let _bot: Chat | null = null;

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

// Register all SDK event handlers (onNewMention, onSubscribedMessage, onAction).
// This import has side effects — handler registrations happen at module load.
import("./handlers").catch(() => {
	// Silently ignore handler import failures during build/test environments
	// where Chat SDK credentials may not be available.
});
