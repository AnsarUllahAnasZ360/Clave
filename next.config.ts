import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	typedRoutes: true,
	outputFileTracingIncludes: {
		"/api/mcp/excalidraw/route": [
			"./src/lib/excalidraw-mcp-official/dist/mcp-app.html",
		],
	},
};

const withMDX = createMDX();

export default withMDX(nextConfig);
