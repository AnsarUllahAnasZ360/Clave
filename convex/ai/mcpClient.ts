/**
 * MCP Client integration — loads tools from remote MCP servers
 * and merges them into the AI agent's available tool set.
 *
 * Connections are ephemeral: created per agent run and closed after streaming.
 */

import { createMCPClient, type MCPClient } from "@ai-sdk/mcp";
import type { Tool } from "ai";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";

// Keep MCP tool discovery responsive so chat generation starts quickly even
// when a selected MCP server is slow or unreachable.
const MCP_CONNECTION_TIMEOUT_MS = 1_500;

export type McpToolSet = Record<string, Tool>;

export interface McpLoadResult {
	/** Merged MCP tools from all successfully connected servers */
	tools: McpToolSet;
	/** Active MCP client instances — caller must close these after use */
	clients: MCPClient[];
}

export function resolveMcpTransportType(server: {
	transport?: "http" | "sse";
}): "http" | "sse" {
	return server.transport ?? "sse";
}

function requiresConfiguration(server: {
	authType?: "none" | "apiKey" | "oauth";
	apiKey?: string;
}): boolean {
	if (server.authType === "oauth") {
		return !server.apiKey;
	}
	if (server.authType === "apiKey") {
		return !server.apiKey;
	}
	return false;
}

/**
 * Load tools from all active MCP servers for a workspace.
 *
 * Connects to each active MCP server, lists available tools, applies
 * any enabledTools whitelist, and returns the merged tool set.
 *
 * Handles connection failures gracefully — logs a warning and skips
 * the failed server without blocking the agent.
 *
 * @returns Tools and client references. Caller MUST close clients after use.
 */
export async function loadMcpTools(
	ctx: ActionCtx,
	workspaceId: Id<"workspaces">,
	options?: {
		selectedServerIds?: Id<"mcpServers">[];
	},
): Promise<McpLoadResult> {
	const selectedServerIds = options?.selectedServerIds;
	// Explicitly selected none: skip workspace server query entirely.
	if (selectedServerIds && selectedServerIds.length === 0) {
		return { tools: {}, clients: [] };
	}

	type InternalMcpServer = {
		_id: Id<"mcpServers">;
		name: string;
		url: string;
		transport?: "http" | "sse";
		authType?: "none" | "apiKey" | "oauth";
		authConfigUrl?: string;
		apiKey?: string;
		enabledTools?: string[];
	};
	const servers = (await ctx.runQuery(internal.mcpServers.listActiveInternal, {
		workspaceId,
	})) as InternalMcpServer[];
	const selectedSet =
		selectedServerIds !== undefined ? new Set(selectedServerIds) : null;
	const eligibleServers = (
		selectedSet
			? servers.filter((server) => selectedSet.has(server._id))
			: servers
	).filter((server) => !requiresConfiguration(server));

	if (eligibleServers.length === 0) {
		return { tools: {}, clients: [] };
	}

	const allTools: McpToolSet = {};
	const clients: MCPClient[] = [];

	// Connect to each server concurrently with individual timeouts
	type McpServer = (typeof eligibleServers)[number];
	const results = await Promise.allSettled(
		eligibleServers.map(async (server: McpServer) => {
			const headers: Record<string, string> = {};
			if (server.apiKey) {
				headers.Authorization = `Bearer ${server.apiKey}`;
				headers["X-API-Key"] = server.apiKey;
			}
			const transportType = resolveMcpTransportType(server);

			const client = await Promise.race([
				createMCPClient({
					transport: {
						type: transportType,
						url: server.url,
						headers,
					},
					name: `mcp-${server.name}`,
				}),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error("Connection timed out")),
						MCP_CONNECTION_TIMEOUT_MS,
					),
				),
			]);

			const tools = await client.tools();
			return { server, client, tools };
		}),
	);

	for (const result of results) {
		if (result.status === "rejected") {
			console.warn(
				"[mcpClient:loadMcpTools] Failed to connect to MCP server:",
				result.reason instanceof Error ? result.reason.message : result.reason,
			);
			continue;
		}

		const { server, client, tools } = result.value;
		clients.push(client);

		// Apply enabledTools whitelist if configured
		for (const [name, tool] of Object.entries(tools) as [string, Tool][]) {
			if (server.enabledTools && !server.enabledTools.includes(name)) {
				continue;
			}
			// Prefix tool name with server name to avoid collisions
			const prefixedName = `mcp_${server.name.replace(/\s+/g, "_").toLowerCase()}_${name}`;
			allTools[prefixedName] = tool;
		}
	}

	return { tools: allTools, clients };
}

/**
 * Close all MCP client connections.
 * Call this after the agent has finished streaming.
 */
export async function closeMcpClients(clients: MCPClient[]): Promise<void> {
	await Promise.allSettled(
		clients.map(async (client) => {
			try {
				await client.close();
			} catch {
				// Ignore close errors
			}
		}),
	);
}
