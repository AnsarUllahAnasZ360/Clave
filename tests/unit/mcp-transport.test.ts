import { describe, expect, it } from "vitest";
import { resolveMcpTransportType } from "../../convex/ai/mcpClient";

describe("resolveMcpTransportType", () => {
	it("defaults to sse for legacy rows without transport", () => {
		expect(resolveMcpTransportType({})).toBe("sse");
	});

	it("keeps explicit http transport", () => {
		expect(resolveMcpTransportType({ transport: "http" })).toBe("http");
	});

	it("keeps explicit sse transport", () => {
		expect(resolveMcpTransportType({ transport: "sse" })).toBe("sse");
	});
});
