/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import {
	delegateToSubAgent,
	getSubAgentTools,
	listAvailableSubAgents,
	subAgentTools,
} from "../../convex/ai/subAgentTool";

// ── Exports ──────────────────────────────────────────────────────────────

describe("subAgentTool exports", () => {
	it("exports listAvailableSubAgents tool", () => {
		expect(listAvailableSubAgents).toBeDefined();
		expect(listAvailableSubAgents.description).toContain("sub-agents");
		expect(typeof listAvailableSubAgents.execute).toBe("function");
	});

	it("exports delegateToSubAgent tool", () => {
		expect(delegateToSubAgent).toBeDefined();
		expect(delegateToSubAgent.description).toContain("Delegate");
		expect(typeof delegateToSubAgent.execute).toBe("function");
	});

	it("exports subAgentTools as combined toolset", () => {
		expect(subAgentTools).toBeDefined();
		expect(subAgentTools.listAvailableSubAgents).toBe(listAvailableSubAgents);
		expect(subAgentTools.delegateToSubAgent).toBe(delegateToSubAgent);
	});

	it("getSubAgentTools returns the combined toolset", () => {
		const tools = getSubAgentTools();
		expect(tools).toBe(subAgentTools);
		expect(tools.listAvailableSubAgents).toBeDefined();
		expect(tools.delegateToSubAgent).toBeDefined();
	});
});

// ── Tool descriptions ────────────────────────────────────────────────────

describe("tool descriptions", () => {
	it("listAvailableSubAgents mentions discovery", () => {
		expect(listAvailableSubAgents.description).toContain(
			"List all available sub-agents",
		);
		expect(listAvailableSubAgents.description).toContain("delegateToSubAgent");
	});

	it("delegateToSubAgent mentions delegation", () => {
		expect(delegateToSubAgent.description).toContain("specialized sub-agent");
		expect(delegateToSubAgent.description).toContain("listAvailableSubAgents");
	});
});

// ── Input schemas ────────────────────────────────────────────────────────

describe("tool input schemas", () => {
	it("listAvailableSubAgents has no required input", () => {
		// The input schema is z.object({}) — empty
		expect(listAvailableSubAgents.inputSchema).toBeDefined();
	});

	it("delegateToSubAgent has subAgentId and message inputs", () => {
		expect(delegateToSubAgent.inputSchema).toBeDefined();
	});
});
