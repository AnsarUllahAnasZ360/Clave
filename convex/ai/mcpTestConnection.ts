"use node";

import { createMCPClient } from "@ai-sdk/mcp";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import { action } from "../_generated/server";

const MCP_CONNECTION_TIMEOUT_MS = 5_000;

/** Test connectivity to a remote MCP server. Returns tool count or error. */
export const testConnection = action({
	args: {
		id: v.id("mcpServers"),
	},
	returns: v.object({
		success: v.boolean(),
		toolCount: v.optional(v.number()),
		toolNames: v.optional(v.array(v.string())),
		error: v.optional(v.string()),
		authRequired: v.optional(v.boolean()),
		requiresConfiguration: v.optional(v.boolean()),
		configureUrl: v.optional(v.string()),
	}),
	handler: async (
		ctx,
		args,
	): Promise<{
		success: boolean;
		toolCount?: number;
		toolNames?: string[];
		error?: string;
		authRequired?: boolean;
		requiresConfiguration?: boolean;
		configureUrl?: string;
	}> => {
		const server: {
			_id: string;
			workspaceId: string;
			name: string;
			url: string;
			transport?: "http" | "sse";
			authType?: "none" | "apiKey" | "oauth";
			authConfigUrl?: string;
			apiKey?: string;
			enabledTools?: string[];
			status: "active" | "inactive";
			deletedAt?: number;
		} | null = await ctx.runQuery(internal.mcpServers.getInternal, {
			id: args.id,
		});
		if (!server || server.deletedAt) {
			return { success: false, error: "MCP server not found" };
		}
		const authType = server.authType ?? (server.apiKey ? "apiKey" : "none");
		const configureUrl = server.authConfigUrl || server.url;
		if (authType === "oauth" && !server.apiKey) {
			return {
				success: false,
				error: "OAuth configuration required",
				authRequired: true,
				requiresConfiguration: true,
				configureUrl,
			};
		}
		if (authType === "apiKey" && !server.apiKey) {
			return {
				success: false,
				error: "API key required",
				authRequired: true,
				requiresConfiguration: true,
				configureUrl,
			};
		}

		let client: Awaited<ReturnType<typeof createMCPClient>> | undefined;
		try {
			const headers: Record<string, string> = {};
			if (server.apiKey) {
				headers.Authorization = `Bearer ${server.apiKey}`;
				headers["X-API-Key"] = server.apiKey;
			}
			const transportType = server.transport ?? "sse";

			client = await Promise.race([
				createMCPClient({
					transport: {
						type: transportType,
						url: server.url,
						headers,
					},
				}),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error("Connection timed out")),
						MCP_CONNECTION_TIMEOUT_MS,
					),
				),
			]);

			const tools: Record<string, unknown> = await client.tools();
			const toolNames: string[] = Object.keys(tools);

			return {
				success: true,
				toolCount: toolNames.length,
				toolNames,
			};
		} catch (error) {
			const message = error instanceof Error ? error.message : "Unknown error";
			const lower = message.toLowerCase();
			const authRequired =
				lower.includes("401") ||
				lower.includes("403") ||
				lower.includes("unauthorized") ||
				lower.includes("forbidden") ||
				lower.includes("authentication") ||
				lower.includes("auth");
			console.error(
				`[mcpTestConnection] Failed for "${server.name}":`,
				message,
			);
			return {
				success: false,
				error: message,
				...(authRequired ? { authRequired: true } : {}),
				...(authRequired ? { requiresConfiguration: true } : {}),
				...(authRequired ? { configureUrl } : {}),
			};
		} finally {
			if (client) {
				try {
					await client.close();
				} catch {
					// Ignore close errors
				}
			}
		}
	},
});
