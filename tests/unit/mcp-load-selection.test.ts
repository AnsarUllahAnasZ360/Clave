import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import type { ActionCtx } from "../../convex/_generated/server";
import { loadMcpTools } from "../../convex/ai/mcpClient";

function makeWorkspaceId() {
	return "workspace_test" as Id<"workspaces">;
}

describe("loadMcpTools selection behavior", () => {
	it("takes fast path when no servers selected and pageContext is not board", async () => {
		const runMutation = vi.fn();
		const runQuery = vi.fn(async () => []);
		const ctx = { runMutation, runQuery } as unknown as ActionCtx;

		const result = await loadMcpTools(ctx, makeWorkspaceId(), {
			selectedServerIds: [],
		});

		expect(result.tools).toEqual({});
		expect(result.clients).toEqual([]);
		expect(result.timing.fastPath).toBe(true);
		// Fast path skips both mutation and query
		expect(runMutation).not.toHaveBeenCalled();
		expect(runQuery).not.toHaveBeenCalled();
	});

	it("queries servers when optional servers are selected", async () => {
		const runMutation = vi.fn();
		const runQuery = vi.fn(async () => []);
		const ctx = { runMutation, runQuery } as unknown as ActionCtx;

		const result = await loadMcpTools(ctx, makeWorkspaceId(), {
			selectedServerIds: ["server_test" as Id<"mcpServers">],
		});

		expect(result.tools).toEqual({});
		expect(result.clients).toEqual([]);
		expect(result.timing.fastPath).toBe(false);
		// No ensureSystemExcalidrawServer mutation, but does query for servers
		expect(runMutation).not.toHaveBeenCalled();
		expect(runQuery).toHaveBeenCalledTimes(1);
	});

	it("queries servers when pageContext is board even with no selection", async () => {
		const runMutation = vi.fn();
		const runQuery = vi.fn(async () => []);
		const ctx = { runMutation, runQuery } as unknown as ActionCtx;

		const result = await loadMcpTools(ctx, makeWorkspaceId(), {
			selectedServerIds: [],
			pageContext: "board",
		});

		expect(result.tools).toEqual({});
		expect(result.clients).toEqual([]);
		expect(result.timing.fastPath).toBe(false);
		expect(runQuery).toHaveBeenCalledTimes(1);
	});
});
