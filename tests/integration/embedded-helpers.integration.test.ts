/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import { extractPlainTextFromBody } from "../../convex/ai/embedded_helpers";

describe("embedded helper text extraction (integration)", () => {
	it("normalizes mixed rich-text payloads into prompt-safe plain text", () => {
		const issueDescription = JSON.stringify([
			{
				type: "h2",
				children: [{ text: "Problem" }],
			},
			{
				type: "p",
				children: [{ text: "  Slash commands fail on issue descriptions.  " }],
			},
			{
				type: "p",
				children: [{ text: "Need immediate feedback." }],
			},
		]);

		expect(extractPlainTextFromBody(issueDescription)).toBe(
			"Problem Slash commands fail on issue descriptions. Need immediate feedback.",
		);
	});

	it("reads text from nested content and children arrays in one payload", () => {
		const mixedPayload = JSON.stringify({
			type: "doc",
			content: [
				{
					type: "paragraph",
					children: [{ text: "Project context" }],
				},
				{
					type: "paragraph",
					content: [{ type: "text", text: "and document context" }],
				},
			],
		});

		expect(extractPlainTextFromBody(mixedPayload)).toBe(
			"Project context and document context",
		);
	});
});
