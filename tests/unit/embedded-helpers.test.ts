/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { extractPlainTextFromBody } from "../../convex/ai/embedded_helpers";

describe("extractPlainTextFromBody", () => {
	it("returns plain text bodies unchanged", () => {
		expect(extractPlainTextFromBody("Simple plain text")).toBe(
			"Simple plain text",
		);
	});

	it("extracts text from Plate/Slate JSON arrays", () => {
		const body = JSON.stringify([
			{
				type: "p",
				children: [{ text: "First line" }],
			},
			{
				type: "p",
				children: [{ text: "Second line" }],
			},
		]);

		expect(extractPlainTextFromBody(body)).toBe("First line Second line");
	});

	it("extracts text from object-based JSON payloads", () => {
		const body = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					content: [{ type: "text", text: "Hello" }],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: "world" }],
				},
			],
		});

		expect(extractPlainTextFromBody(body)).toBe("Hello world");
	});

	it("falls back to original body for malformed JSON", () => {
		const malformed = '[{"type":"p"';
		expect(extractPlainTextFromBody(malformed)).toBe(malformed);
	});
});
