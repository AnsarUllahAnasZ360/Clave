import type { UIMessage } from "@convex-dev/agent/react";
import { describe, expect, it } from "vitest";
import { isPendingUserMessageDelivered } from "../../src/hooks/use-ai-chat";

function buildUserMessage(text: string, fileUrls: string[] = []): UIMessage {
	return {
		_creationTime: Date.now(),
		id: `user-${Math.random().toString(36).slice(2, 6)}`,
		key: `user-${Math.random().toString(36).slice(2, 6)}`,
		order: 1,
		parts: [
			{ type: "text", text },
			...fileUrls.map((url) => ({
				type: "file" as const,
				url,
				mediaType: "text/plain",
			})),
		],
		role: "user",
		status: "success",
		stepOrder: 0,
		text,
	};
}

describe("isPendingUserMessageDelivered", () => {
	it("matches by trimmed text and file URLs (order-insensitive)", () => {
		const rawMessages: UIMessage[] = [
			buildUserMessage("  Ship sprint recap  ", [
				"https://files/2.txt",
				"https://files/1.txt",
			]),
		];

		expect(
			isPendingUserMessageDelivered(rawMessages, {
				prompt: "Ship sprint recap",
				files: [
					{
						filename: "1.txt",
						mediaType: "text/plain",
						url: "https://files/1.txt",
					},
					{
						filename: "2.txt",
						mediaType: "text/plain",
						url: "https://files/2.txt",
					},
				],
			}),
		).toBe(true);
	});

	it("returns false when the latest user message does not match", () => {
		const rawMessages: UIMessage[] = [buildUserMessage("Different prompt")];

		expect(
			isPendingUserMessageDelivered(rawMessages, {
				prompt: "Ship sprint recap",
				files: [],
			}),
		).toBe(false);
	});
});
