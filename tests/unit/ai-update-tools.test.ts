import { describe, expect, it } from "vitest";
import { writeTools } from "../../convex/ai/tools/write";

describe("AI update tools", () => {
	describe("writeTools export", () => {
		it("includes updateDocument tool", () => {
			expect(writeTools).toHaveProperty("updateDocument");
		});

		it("includes updateProject tool", () => {
			expect(writeTools).toHaveProperty("updateProject");
		});

		it("still includes all original tools", () => {
			const expectedTools = [
				"createIssue",
				"updateIssue",
				"addComment",
				"assignIssue",
				"batchUpdateIssues",
				"createDocument",
				"updateDocument",
				"createProject",
				"updateProject",
				"createLabel",
				"createWhiteboard",
				"updateWhiteboard",
				"generateWhiteboardDiagram",
				"approvePendingAction",
				"createSprint",
				"moveIssueToSprint",
				"updateSprint",
			];
			for (const tool of expectedTools) {
				expect(writeTools).toHaveProperty(tool);
			}
			expect(Object.keys(writeTools)).toHaveLength(expectedTools.length);
		});
	});

	describe("updateDocument tool shape", () => {
		it("has correct description mentioning title and content", () => {
			const tool = writeTools.updateDocument;
			expect(tool.description).toContain("title");
			expect(tool.description).toContain("content");
		});
	});

	describe("updateProject tool shape", () => {
		it("has correct description mentioning project fields", () => {
			const tool = writeTools.updateProject;
			expect(tool.description).toContain("name");
			expect(tool.description).toContain("status");
			expect(tool.description).toContain("priority");
		});
	});
});
