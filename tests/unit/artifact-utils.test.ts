import { describe, expect, it } from "vitest";
import {
	extractArtifacts,
	filterArtifactCards,
} from "../../src/lib/ai/artifact-utils";
import type { ArtifactData } from "../../src/types/artifacts";

function buildCodeLines(count: number): string {
	return Array.from({ length: count }, (_, i) => `line_${i + 1}`).join("\n");
}

describe("artifact-utils", () => {
	it("captures code language tags that include symbols (e.g. c++)", () => {
		const content = buildCodeLines(30);
		const message = `\`\`\`c++\n${content}\n\`\`\``;

		const artifacts = extractArtifacts(message, "success");
		const codeArtifact = artifacts.find((artifact) => artifact.type === "code");

		expect(codeArtifact).toBeDefined();
		expect(codeArtifact?.language).toBe("c++");
	});

	it("does not extract markdown table artifacts from inside fenced code", () => {
		const message = [
			"```sql",
			"| user | score |",
			"| --- | --- |",
			"| A | 10 |",
			"| B | 9 |",
			"| C | 8 |",
			"| D | 7 |",
			"| E | 6 |",
			"```",
		].join("\n");

		const artifacts = extractArtifacts(message, "success");

		expect(artifacts.some((artifact) => artifact.type === "table")).toBe(false);
	});

	it("filters redundant cards for artifacts already rendered inline", () => {
		const artifacts: ArtifactData[] = [
			{
				id: "a1",
				type: "code",
				title: "Code sample",
				content: "const a = 1;",
				status: "complete",
				language: "typescript",
			},
			{
				id: "a2",
				type: "diagram",
				title: "Diagram sample",
				content: "graph TD; A-->B;",
				status: "complete",
			},
			{
				id: "a3",
				type: "table",
				title: "Table sample",
				content: "| A |\n| - |\n| 1 |",
				status: "complete",
			},
			{
				id: "a4",
				type: "markdown",
				title: "Document sample",
				content: "## Title\nBody text",
				status: "complete",
			},
		];

		const filtered = filterArtifactCards(artifacts);

		expect(filtered).toHaveLength(1);
		expect(filtered[0]?.type).toBe("markdown");
	});
});
