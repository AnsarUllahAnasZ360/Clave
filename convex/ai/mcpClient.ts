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
const ENABLE_MCP_TRACE = process.env.AI_CHAT_DEBUG_TIMING === "true";

function logMcpClient(message: string, data?: Record<string, unknown>) {
	if (!ENABLE_MCP_TRACE) return;
	console.info(`[mcpClient] ${message}`, data ?? {});
}

export type McpToolSet = Record<string, Tool>;

export interface McpServerTiming {
	serverName: string;
	connectMs: number;
	toolDiscoveryMs: number;
	totalMs: number;
	toolCount: number;
}

export interface McpTiming {
	totalMs: number;
	queryMs: number;
	servers: McpServerTiming[];
	fastPath: boolean;
}

export interface McpLoadResult {
	/** Merged MCP tools from all successfully connected servers */
	tools: McpToolSet;
	/** Active MCP client instances — caller must close these after use */
	clients: MCPClient[];
	/** Timing data for performance analysis */
	timing: McpTiming;
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

function isRequiredExcalidrawServer(server: {
	name: string;
	url: string;
}): boolean {
	const lowerUrl = server.url.trim().toLowerCase();
	return (
		lowerUrl.includes("/api/mcp/excalidraw") ||
		lowerUrl.includes("/mcp/excalidraw")
	);
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
		pageContext?: string;
	},
): Promise<McpLoadResult> {
	const selectedServerIds = options?.selectedServerIds;
	const pageContext = options?.pageContext;
	const startedAt = Date.now();
	logMcpClient("loadMcpTools:start", {
		workspaceId,
		hasSelection: selectedServerIds !== undefined,
		selectionCount: selectedServerIds?.length ?? 0,
		pageContext: pageContext ?? "none",
		timeoutMs: MCP_CONNECTION_TIMEOUT_MS,
	});

	// Fast path: skip MCP work when no optional servers are selected
	// and the page is not a board. The built-in board tools (createWhiteboard,
	// addElementsToWhiteboard, etc.) work from any page without MCP.
	// Excalidraw MCP tools (read_me) are only loaded on board pages.
	const hasOptionalServers =
		selectedServerIds !== undefined && selectedServerIds.length > 0;
	if (!hasOptionalServers && pageContext !== "board") {
		const fastPathMs = Date.now() - startedAt;
		logMcpClient("loadMcpTools:fast-path", {
			workspaceId,
			pageContext: pageContext ?? "none",
			elapsedMs: fastPathMs,
		});
		return {
			tools: {},
			clients: [],
			timing: {
				totalMs: fastPathMs,
				queryMs: 0,
				servers: [],
				fastPath: true,
			},
		};
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
	const queryStart = Date.now();
	const servers = (await ctx.runQuery(internal.mcpServers.listActiveInternal, {
		workspaceId,
	})) as InternalMcpServer[];
	const queryMs = Date.now() - queryStart;
	const selectedSet = selectedServerIds ? new Set(selectedServerIds) : null;
	const requiredServerIds = new Set(
		servers
			.filter((server) => isRequiredExcalidrawServer(server))
			.map((server) => server._id),
	);
	const eligibleServers = (
		selectedSet
			? servers.filter(
					(server) =>
						selectedSet.has(server._id) || requiredServerIds.has(server._id),
				)
			: servers
	).filter((server) => !requiresConfiguration(server));

	if (eligibleServers.length === 0) {
		const emptyMs = Date.now() - startedAt;
		logMcpClient("loadMcpTools:empty", {
			workspaceId,
			elapsedMs: emptyMs,
		});
		return {
			tools: {},
			clients: [],
			timing: { totalMs: emptyMs, queryMs, servers: [], fastPath: false },
		};
	}

	const allTools: McpToolSet = {};
	const clients: MCPClient[] = [];
	const serverTimings: McpServerTiming[] = [];

	// Connect to each server concurrently with individual timeouts
	type McpServer = (typeof eligibleServers)[number];
	const results = await Promise.allSettled(
		eligibleServers.map(async (server: McpServer) => {
			const serverStartedAt = Date.now();
			const headers: Record<string, string> = {};
			if (server.apiKey) {
				headers.Authorization = `Bearer ${server.apiKey}`;
				headers["X-API-Key"] = server.apiKey;
			}
			const transportType = resolveMcpTransportType(server);

			const connectStart = Date.now();
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
			const connectMs = Date.now() - connectStart;

			const toolDiscoveryStart = Date.now();
			const tools = await client.tools();
			const toolDiscoveryMs = Date.now() - toolDiscoveryStart;

			return {
				server,
				client,
				tools,
				connectMs,
				toolDiscoveryMs,
				totalMs: Date.now() - serverStartedAt,
				toolCount: Object.keys(tools).length,
			};
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

		const {
			server,
			client,
			tools,
			connectMs,
			toolDiscoveryMs,
			totalMs,
			toolCount,
		} = result.value;
		serverTimings.push({
			serverName: server.name,
			connectMs,
			toolDiscoveryMs,
			totalMs,
			toolCount,
		});
		logMcpClient("loadMcpTools:server", {
			serverId: server._id,
			serverName: server.name,
			transport: resolveMcpTransportType(server),
			connectMs,
			toolDiscoveryMs,
			totalMs,
			toolCount,
		});
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

	const totalMs = Date.now() - startedAt;
	logMcpClient("loadMcpTools:complete", {
		workspaceId,
		serversFound: servers.length,
		eligibleServers: eligibleServers.length,
		toolCount: Object.keys(allTools).length,
		connectedClients: clients.length,
		queryMs,
		totalMs,
	});

	return {
		tools: allTools,
		clients,
		timing: { totalMs, queryMs, servers: serverTimings, fastPath: false },
	};
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
