// @vitest-environment node
import { describe, expect, it } from "vitest";
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
	it("always returns a Response for GET probes", async () => {
		const res = await GET(
			new Request("http://local/api/mcp/excalidraw", {
				method: "GET",
			}),
		);

		expect(res).toBeInstanceOf(Response);
	});

	it("initializes and exposes official tool surface", async () => {
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
			result?: { serverInfo?: { name?: string } };
		} | null;
		expect(initPayload?.result?.serverInfo?.name).toBe("Excalidraw");

		const listRes = await POST(
			new Request("http://local/api/mcp/excalidraw", {
				method: "POST",
				headers: {
					"content-type": "application/json",
					accept,
				},
				body: JSON.stringify({
					jsonrpc: "2.0",
					id: 2,
					method: "tools/list",
					params: {},
				}),
			}),
		);
		expect(listRes.status).toBe(200);
		const listPayload = extractEventData(await listRes.text()) as {
			result?: { tools?: Array<{ name?: string }> };
		} | null;
		const toolNames = (listPayload?.result?.tools ?? [])
			.map((tool) => tool.name)
			.filter((name): name is string => Boolean(name));

		expect(toolNames).toEqual(
			expect.arrayContaining([
				"read_me",
				"create_view",
				"export_to_excalidraw",
				"save_checkpoint",
				"read_checkpoint",
			]),
		);
	});
});
