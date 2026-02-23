import { describe, expect, it } from "vitest";
import type { ResolvedMention } from "../../convex/ai/mentionResolver";
import { buildMentionContextBlock } from "../../convex/ai/mentionResolver";

describe("ai/mentionResolver", () => {
	describe("buildMentionContextBlock", () => {
		it("returns empty string for empty array", () => {
			expect(buildMentionContextBlock([])).toBe("");
		});

		it("builds context block for a single mention", () => {
			const mentions: ResolvedMention[] = [
				{
					entityType: "user",
					entityId: "user123",
					displayName: "Alice",
					contextSummary: "@Alice (User, Admin): No open issues",
				},
			];
			const result = buildMentionContextBlock(mentions);
			expect(result).toContain("--- Referenced Entities ---");
			expect(result).toContain("@Alice (User, Admin): No open issues");
			expect(result).toContain(
				"The user has explicitly referenced the above entities",
			);
		});

		it("builds context block for multiple mentions", () => {
			const mentions: ResolvedMention[] = [
				{
					entityType: "user",
					entityId: "user1",
					displayName: "Alice",
					contextSummary: "@Alice (User, Admin)",
				},
				{
					entityType: "issue",
					entityId: "issue1",
					displayName: "CLV-042",
					contextSummary: "@CLV-042 — Fix login bug (Issue)",
				},
				{
					entityType: "document",
					entityId: "doc1",
					displayName: "Design Spec",
					contextSummary: "@Design Spec (Document)",
				},
			];
			const result = buildMentionContextBlock(mentions);
			expect(result).toContain("@Alice (User, Admin)");
			expect(result).toContain("@CLV-042 — Fix login bug (Issue)");
			expect(result).toContain("@Design Spec (Document)");
		});

		it("separates mentions with double newlines", () => {
			const mentions: ResolvedMention[] = [
				{
					entityType: "user",
					entityId: "u1",
					displayName: "A",
					contextSummary: "Summary A",
				},
				{
					entityType: "user",
					entityId: "u2",
					displayName: "B",
					contextSummary: "Summary B",
				},
			];
			const result = buildMentionContextBlock(mentions);
			expect(result).toContain("Summary A\n\nSummary B");
		});
	});
});
