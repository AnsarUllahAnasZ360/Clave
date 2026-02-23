import path from "node:path";
import { createMcpHandler } from "mcp-handler";
import { NextResponse } from "next/server";
import { createVercelStore } from "@/lib/excalidraw-mcp-official/checkpoint-store";
import { registerTools } from "@/lib/excalidraw-mcp-official/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const checkpointStore = createVercelStore();

const mcpHandler = createMcpHandler(
	(server) => {
		const distDir = path.join(
			process.cwd(),
			"src/lib/excalidraw-mcp-official/dist",
		);
		registerTools(server, distDir, checkpointStore);
	},
	{
		serverInfo: {
			name: "Excalidraw",
			version: "1.0.0",
		},
	},
	{
		basePath: "",
		maxDuration,
		sessionIdGenerator: undefined,
	},
);

const makeMcpRequest = (request: Request): Request => {
	const url = new URL(request.url);
	url.pathname = "/mcp";
	return new Request(url.toString(), request);
};

async function handler(request: Request) {
	try {
		const response = await mcpHandler(makeMcpRequest(request));
		if (response instanceof Response) return response;
		console.error("[mcp/excalidraw] Non-Response returned from MCP handler");
		return NextResponse.json(
			{ error: "Invalid MCP handler response" },
			{ status: 502 },
		);
	} catch (error) {
		console.error(
			"[mcp/excalidraw] Failed to handle request:",
			error instanceof Error ? error.message : error,
		);
		return NextResponse.json(
			{ error: "Failed to handle MCP request" },
			{ status: 502 },
		);
	}
}

export {
	handler as DELETE,
	handler as GET,
	handler as OPTIONS,
	handler as POST,
};
