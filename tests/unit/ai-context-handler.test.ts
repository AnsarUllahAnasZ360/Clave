import { describe, expect, it } from "vitest";
import {
	PROTECTED_RECENT_COUNT,
	TRIM_THRESHOLD_CHARS,
	trimOlderMessages,
} from "../../convex/ai/agents";

describe("trimOlderMessages", () => {
	const shortMsg = (role: "user" | "assistant", text: string) => ({
		role,
		content: text,
	});

	const longMsg = (role: "user" | "assistant", length: number) => ({
		role,
		content: "x".repeat(length),
	});

	it("returns messages unchanged when count <= PROTECTED_RECENT_COUNT", () => {
		const msgs = [
			shortMsg("user", "hello"),
			longMsg("assistant", TRIM_THRESHOLD_CHARS + 500),
			shortMsg("user", "again"),
		];
		const result = trimOlderMessages(msgs);
		expect(result).toEqual(msgs);
	});

	it("trims long assistant messages outside the protected window", () => {
		const msgs = [
			longMsg("assistant", TRIM_THRESHOLD_CHARS + 500),
			shortMsg("user", "msg2"),
			shortMsg("assistant", "short"),
			shortMsg("user", "msg4"),
			shortMsg("assistant", "recent1"),
			shortMsg("user", "recent2"),
			shortMsg("assistant", "recent3"),
			shortMsg("user", "recent4"),
		];
		const result = trimOlderMessages(msgs);

		// First message (old, long assistant) should be trimmed
		expect(typeof result[0].content).toBe("string");
		expect((result[0].content as string).length).toBeLessThan(
			TRIM_THRESHOLD_CHARS + 500,
		);
		expect((result[0].content as string).endsWith("… [trimmed]")).toBe(true);

		// Short assistant message in older context is NOT trimmed
		expect(result[2].content).toBe("short");

		// Protected recent messages are untouched
		const protectedStart = msgs.length - PROTECTED_RECENT_COUNT;
		for (let i = protectedStart; i < msgs.length; i++) {
			expect(result[i]).toEqual(msgs[i]);
		}
	});

	it("does not trim user messages even if long", () => {
		const msgs = [
			longMsg("user", TRIM_THRESHOLD_CHARS + 1000),
			shortMsg("assistant", "ok"),
			shortMsg("user", "recent1"),
			shortMsg("assistant", "recent2"),
			shortMsg("user", "recent3"),
			shortMsg("assistant", "recent4"),
		];
		const result = trimOlderMessages(msgs);
		// User message should be untouched
		expect((result[0].content as string).length).toBe(
			TRIM_THRESHOLD_CHARS + 1000,
		);
	});

	it("preserves non-string content (e.g. content arrays)", () => {
		const contentArray = [{ type: "text" as const, text: "x".repeat(3000) }];
		const msgs = [
			{ role: "assistant" as const, content: contentArray },
			shortMsg("user", "msg2"),
			shortMsg("assistant", "recent1"),
			shortMsg("user", "recent2"),
			shortMsg("assistant", "recent3"),
			shortMsg("user", "recent4"),
		];
		const result = trimOlderMessages(msgs);
		// Non-string content should pass through unchanged
		expect(result[0].content).toBe(contentArray);
	});

	it("handles empty array", () => {
		expect(trimOlderMessages([])).toEqual([]);
	});

	it("trimmed content starts with the original prefix", () => {
		const original = "Hello world! ".repeat(200);
		const msgs = [
			{ role: "assistant" as const, content: original },
			shortMsg("user", "a"),
			shortMsg("assistant", "b"),
			shortMsg("user", "c"),
			shortMsg("assistant", "d"),
			shortMsg("user", "e"),
		];
		const result = trimOlderMessages(msgs);
		const trimmed = result[0].content as string;
		expect(trimmed.startsWith(original.slice(0, TRIM_THRESHOLD_CHARS))).toBe(
			true,
		);
	});
});
