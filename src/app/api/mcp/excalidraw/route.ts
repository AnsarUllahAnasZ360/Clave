import path from "node:path";
import { createMcpHandler } from "mcp-handler";
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

const handler = async (request: Request) => {
	const url = new URL(request.url);
	if (url.pathname.startsWith("/api/mcp/excalidraw")) {
		url.pathname = "/mcp";
		return mcpHandler(new Request(url.toString(), request));
	}
	return mcpHandler(request);
};

export { handler as DELETE, handler as GET, handler as POST };
