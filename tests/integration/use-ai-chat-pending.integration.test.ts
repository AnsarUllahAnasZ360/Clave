/**
 * @vitest-environment node
 */

import type { UIMessage } from "@convex-dev/agent/react";
import { describe, expect, it } from "vitest";
import { isPendingUserMessageDelivered } from "../../src/hooks/use-ai-chat";

function buildMessage(
	role: "user" | "assistant",
	text: string,
	fileUrls: string[] = [],
): UIMessage {
	return {
		_creationTime: Date.now(),
		id: `${role}-${Math.random().toString(36).slice(2, 6)}`,
		key: `${role}-${Math.random().toString(36).slice(2, 6)}`,
		order: 1,
		parts: [
			{ type: "text", text },
			...fileUrls.map((url) => ({
				type: "file" as const,
				url,
				mediaType: "application/octet-stream",
			})),
		],
		role,
		status: "success",
		stepOrder: 0,
		text,
	};
}

describe("pending message reconciliation (integration)", () => {
	it("uses the latest user message in mixed conversation streams", () => {
		const rawMessages: UIMessage[] = [
			buildMessage("user", "Old draft"),
			buildMessage("assistant", "Acknowledged"),
			buildMessage("user", "Final prompt", ["https://files/context.md"]),
			buildMessage("assistant", "Working on it"),
		];

		expect(
			isPendingUserMessageDelivered(rawMessages, {
				prompt: "Final prompt",
				files: [
					{
						filename: "context.md",
						mediaType: "text/markdown",
						url: "https://files/context.md",
					},
				],
			}),
		).toBe(true);
	});

	it("does not match if only assistant messages are present", () => {
		const rawMessages: UIMessage[] = [buildMessage("assistant", "No user yet")];

		expect(
			isPendingUserMessageDelivered(rawMessages, {
				prompt: "Final prompt",
				files: [],
			}),
		).toBe(false);
	});
});
