/**
 * @vitest-environment node
 */

import { describe, expect, it } from "vitest";
import {
	type McpLoadResult,
	type McpServerTiming,
	type McpTiming,
	type McpToolSet,
	resolveMcpTransportType,
} from "../../convex/ai/mcpClient";

// ── resolveMcpTransportType ──────────────────────────────────────────────

describe("resolveMcpTransportType", () => {
	it("returns configured transport when provided", () => {
		expect(resolveMcpTransportType({ transport: "http" })).toBe("http");
		expect(resolveMcpTransportType({ transport: "sse" })).toBe("sse");
	});

	it("defaults to sse when transport is undefined", () => {
		expect(resolveMcpTransportType({})).toBe("sse");
		expect(resolveMcpTransportType({ transport: undefined })).toBe("sse");
	});
});

// ── Type exports ─────────────────────────────────────────────────────────

describe("McpClient type exports", () => {
	it("McpToolSet is a record of string to Tool", () => {
		// Type-level check — if this compiles, the type is exported correctly
		const toolSet: McpToolSet = {};
		expect(toolSet).toEqual({});
	});

	it("McpLoadResult has tools, clients, and timing fields", () => {
		// Type-level check
		const result: McpLoadResult = {
			tools: {},
			clients: [],
			timing: { totalMs: 0, queryMs: 0, servers: [], fastPath: true },
		};
		expect(result.tools).toEqual({});
		expect(result.clients).toEqual([]);
		expect(result.timing.fastPath).toBe(true);
	});

	it("McpTiming and McpServerTiming types are exported", () => {
		const serverTiming: McpServerTiming = {
			serverName: "test",
			connectMs: 10,
			toolDiscoveryMs: 5,
			totalMs: 15,
			toolCount: 3,
		};
		const timing: McpTiming = {
			totalMs: 20,
			queryMs: 5,
			servers: [serverTiming],
			fastPath: false,
		};
		expect(timing.servers).toHaveLength(1);
		expect(timing.servers[0].serverName).toBe("test");
	});
});
