import bundleAnalyzer from "@next/bundle-analyzer";
import { createMDX } from "fumadocs-mdx/next";
import type { NextConfig } from "next";

const withBundleAnalyzer = bundleAnalyzer({
	enabled: process.env.ANALYZE === "true",
});

const nextConfig: NextConfig = {
	typedRoutes: true,
	outputFileTracingIncludes: {
		"/api/mcp/excalidraw/route": [
			"./src/lib/excalidraw-mcp-official/dist/mcp-app.html",
		],
	},
};

const withMDX = createMDX();

export default withBundleAnalyzer(withMDX(nextConfig));
