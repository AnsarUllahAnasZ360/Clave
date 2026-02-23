/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import {
	extractArtifacts,
	filterArtifactCards,
} from "../../src/lib/ai/artifact-utils";

function buildCodeLines(count: number): string {
	return Array.from({ length: count }, (_, i) => `value_${i + 1}`).join("\n");
}

describe("artifact extraction + card filtering pipeline", () => {
	it("keeps document cards while suppressing inline-rendered code and diagrams", () => {
		const codeBlock = `\`\`\`typescript\n${buildCodeLines(30)}\n\`\`\``;
		const mermaidBlock = [
			"```mermaid",
			"flowchart TD",
			"  Start --> End",
			"```",
		].join("\n");
		const fillerParagraph = Array.from({ length: 210 }, () => "word").join(" ");
		const markdownDoc = [
			"## Plan",
			"Detailed implementation overview.",
			"",
			"## Risks",
			"Mitigation details.",
			"",
			fillerParagraph,
		].join("\n");

		const message = `${markdownDoc}\n\n${codeBlock}\n\n${mermaidBlock}`;

		const extracted = extractArtifacts(message, "success");
		const cards = filterArtifactCards(extracted);

		expect(extracted.some((artifact) => artifact.type === "code")).toBe(true);
		expect(extracted.some((artifact) => artifact.type === "diagram")).toBe(
			true,
		);
		expect(extracted.some((artifact) => artifact.type === "markdown")).toBe(
			true,
		);

		expect(cards).toHaveLength(1);
		expect(cards[0]?.type).toBe("markdown");
	});
});
