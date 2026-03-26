// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "../../src/app/api/mcp/excalidraw/route";

function extractEventData(body: string): unknown {
	const dataLine = body
		.split("\n")
		.find((line) => line.startsWith("data: "))
		?.replace(/^data:\s*/, "");
	if (!dataLine) return null;
	try {
		return JSON.parse(dataLine);
	} catch {
		return null;
	}
}

describe("excalidraw MCP route", () => {
	afterEach(() => {
		vi.restoreAllMocks();
	});

	it("always returns a Response for GET probes", async () => {
		const res = await GET(
			new Request("http://local/api/mcp/excalidraw", {
				method: "GET",
			}),
		);

		expect(res).toBeInstanceOf(Response);
	});

	it("initializes with correct server info", async () => {
		const accept = "application/json, text/event-stream";

		const initRes = await POST(
			new Request("http://local/api/mcp/excalidraw", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept,
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 1,
					method: "initialize",
					params: {
						protocolVersion: "2024-11-05",
						capabilities: {},
						clientInfo: { name: "vitest", version: "1.0.0" },
					},
				}),
			}),
		);
		expect(initRes.status).toBe(200);
		const initPayload = extractEventData(await initRes.text()) as {
			result?: {
				serverInfo?: { name?: string };
				capabilities?: { tools?: Record<string, unknown> };
			};
		} | null;
		expect(initPayload?.result?.serverInfo?.name).toBe("Excalidraw");
		// The server advertises tool capabilities
		expect(initPayload?.result?.capabilities?.tools).toBeDefined();
	});
});
