/**
 * @vitest-environment node
 */

import { describe, expect, it, vi } from "vitest";
import type { Id } from "../../convex/_generated/dataModel";
import type { ActionCtx } from "../../convex/_generated/server";
import { loadMcpTools } from "../../convex/ai/mcpClient";

const workspaceId = "workspace_test" as Id<"workspaces">;

describe("loadMcpTools connector bootstrap behavior (integration)", () => {
	it("takes fast path for calls without explicit selection or board context", async () => {
		const runMutation = vi.fn(async () => null);
		const runQuery = vi.fn(async () => []);
		const ctx = { runMutation, runQuery } as unknown as ActionCtx;

		const result = await loadMcpTools(ctx, workspaceId);

		expect(result.tools).toEqual({});
		expect(result.clients).toEqual([]);
		expect(result.timing.fastPath).toBe(true);
		// Fast path skips all backend calls
		expect(runMutation).not.toHaveBeenCalled();
		expect(runQuery).not.toHaveBeenCalled();
	});
});
