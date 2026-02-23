import { describe, expect, it } from "vitest";
import {
	BUILT_IN_SLASH_COMMANDS,
	buildSlashCommandRegistry,
	filterCommands,
	groupCommandsByCategory,
	parseSlashInput,
	SLASH_COMMANDS,
} from "../../src/lib/ai/slash-commands";

describe("slash command registry", () => {
	it("keeps SLASH_COMMANDS as a backward-compatible alias", () => {
		expect(Array.isArray(SLASH_COMMANDS)).toBe(true);
		expect(SLASH_COMMANDS.length).toBeGreaterThan(0);
		expect(SLASH_COMMANDS).toBe(BUILT_IN_SLASH_COMMANDS);
	});

	it("filters built-in commands without requiring an explicit list", () => {
		expect(() => filterCommands("help")).not.toThrow();

		const matches = filterCommands("help");
		expect(matches.some((command) => command.name === "help")).toBe(true);
	});

	it("merges built-ins and custom commands while deduplicating names", () => {
		const commands = buildSlashCommandRegistry({
			workspaceCommands: [
				{
					id: "w-1",
					command: "daily-sync",
					title: "Daily sync",
					description: "Daily status summary",
					content: "Run a daily sync",
					isShortcut: false,
					createdAt: 1,
					updatedAt: 1,
				},
			],
			personalCommands: [
				{
					id: "p-1",
					command: "help",
					title: "Override help",
					description: "Should not replace built-in help",
					content: "No-op",
					isShortcut: false,
					createdAt: 1,
					updatedAt: 1,
				},
			],
		});

		expect(commands.some((command) => command.name === "daily-sync")).toBe(
			true,
		);
		expect(commands.filter((command) => command.name === "help")).toHaveLength(
			1,
		);
	});

	it("parses slash command input with trailing args", () => {
		const parsed = parseSlashInput("/search open bugs --issues");
		expect(parsed?.command.name).toBe("search");
		expect(parsed?.args).toBe("open bugs --issues");
	});

	it("groups commands by category", () => {
		const groups = groupCommandsByCategory(BUILT_IN_SLASH_COMMANDS);
		expect(groups.get("actions")?.length).toBeGreaterThan(0);
		expect(groups.get("info")?.length).toBeGreaterThan(0);
	});
});
