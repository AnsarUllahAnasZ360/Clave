import { describe, expect, it } from "vitest";
import { toChatMentions } from "../../src/hooks/use-ai-chat";
import type { MentionReference } from "../../src/hooks/use-mention-search";

describe("toChatMentions", () => {
	it("filters out unsupported mention entity types", () => {
		const mentions: MentionReference[] = [
			{
				entityType: "user",
				entityId: "u_1",
				displayName: "Alice",
			},
			{
				entityType: "issue",
				entityId: "i_1",
				displayName: "Issue",
			},
			{
				entityType: "document",
				entityId: "d_1",
				displayName: "Doc",
			},
			{
				entityType: "agent",
				entityId: "a_1",
				displayName: "Planner",
			},
		];

		expect(toChatMentions(mentions)).toEqual([
			{ entityType: "user", entityId: "u_1", displayName: "Alice" },
			{ entityType: "issue", entityId: "i_1", displayName: "Issue" },
			{ entityType: "document", entityId: "d_1", displayName: "Doc" },
		]);
	});

	it("returns an empty list for undefined input", () => {
		expect(toChatMentions(undefined)).toEqual([]);
	});
});
