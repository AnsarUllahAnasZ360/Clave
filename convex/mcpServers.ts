import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	type MutationCtx,
	mutation,
	query,
} from "./_generated/server";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "./lib/auth";

// ── Return value validators ──────────────────────────────────────────────

/** Public-facing MCP server doc — never exposes raw apiKey */
const mcpServerDoc = v.object({
	_id: v.id("mcpServers"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	name: v.string(),
	description: v.optional(v.string()),
	url: v.string(),
	transport: v.union(v.literal("http"), v.literal("sse")),
	authType: v.optional(
		v.union(v.literal("none"), v.literal("apiKey"), v.literal("oauth")),
	),
	authConfigUrl: v.optional(v.string()),
	hasApiKey: v.boolean(),
	enabledTools: v.optional(v.array(v.string())),
	status: v.union(v.literal("active"), v.literal("inactive")),
	createdBy: v.id("users"),
	createdAt: v.number(),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
});

const EXCALIDRAW_SYSTEM_SERVER_NAME = "Excalidraw";
const EXCALIDRAW_SYSTEM_MCP_PATH = "/api/mcp/excalidraw";
const EXCALIDRAW_SYSTEM_DESCRIPTION =
	"Built-in Excalidraw MCP server used by whiteboard AI features.";

function normalizeBaseUrl(raw: string | undefined): string | null {
	const value = raw?.trim();
	if (!value) return null;
	const withProtocol =
		value.startsWith("http://") || value.startsWith("https://")
			? value
			: `https://${value}`;
	try {
		const parsed = new URL(withProtocol);
		return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
	} catch {
		return null;
	}
}

function resolveSystemExcalidrawUrl(): string {
	const baseUrl =
		normalizeBaseUrl(process.env.APP_URL) ??
		normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL) ??
		normalizeBaseUrl(process.env.VERCEL_URL) ??
		`http://localhost:${process.env.DEV_PORT ?? "4000"}`;
	return `${baseUrl}${EXCALIDRAW_SYSTEM_MCP_PATH}`;
}

export function isSystemExcalidrawServer(server: {
	name: string;
	url: string;
}): boolean {
	const lowerUrl = server.url.trim().toLowerCase();
	return (
		lowerUrl.includes("/api/mcp/excalidraw") ||
		lowerUrl.includes("/mcp/excalidraw")
	);
}

async function ensureSystemExcalidrawServerDoc(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
	createdBy: Id<"users">,
): Promise<Id<"mcpServers">> {
	const servers = await ctx.db
		.query("mcpServers")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	const canonicalUrl = resolveSystemExcalidrawUrl();
	const existing = servers.find((server) => isSystemExcalidrawServer(server));
	const now = Date.now();

	if (existing) {
		// Skip the write if every field already matches the expected state.
		const alreadyCurrent =
			existing.name === EXCALIDRAW_SYSTEM_SERVER_NAME &&
			existing.description === EXCALIDRAW_SYSTEM_DESCRIPTION &&
			existing.url === canonicalUrl &&
			existing.transport === "http" &&
			existing.authType === "none" &&
			existing.authConfigUrl === undefined &&
			existing.apiKey === undefined &&
			existing.enabledTools === undefined &&
			existing.status === "active" &&
			existing.deletedAt === undefined;
		if (!alreadyCurrent) {
			await ctx.db.patch(existing._id, {
				name: EXCALIDRAW_SYSTEM_SERVER_NAME,
				description: EXCALIDRAW_SYSTEM_DESCRIPTION,
				url: canonicalUrl,
				transport: "http",
				authType: "none",
				authConfigUrl: undefined,
				apiKey: undefined,
				enabledTools: undefined,
				status: "active",
				deletedAt: undefined,
				updatedAt: now,
			});
		}
		return existing._id;
	}

	return await ctx.db.insert("mcpServers", {
		workspaceId,
		name: EXCALIDRAW_SYSTEM_SERVER_NAME,
		description: EXCALIDRAW_SYSTEM_DESCRIPTION,
		url: canonicalUrl,
		transport: "http",
		authType: "none",
		status: "active",
		createdBy,
		createdAt: now,
		updatedAt: now,
	});
}

// ── Internal Queries (server-side only, includes apiKey) ─────────────────

/** Get a single MCP server record with raw apiKey (for actions). */
export const getInternal = internalQuery({
	args: { id: v.id("mcpServers") },
	returns: v.union(
		v.object({
			_id: v.id("mcpServers"),
			workspaceId: v.id("workspaces"),
			name: v.string(),
			url: v.string(),
			transport: v.union(v.literal("http"), v.literal("sse")),
			authType: v.optional(
				v.union(v.literal("none"), v.literal("apiKey"), v.literal("oauth")),
			),
			authConfigUrl: v.optional(v.string()),
			apiKey: v.optional(v.string()),
			enabledTools: v.optional(v.array(v.string())),
			status: v.union(v.literal("active"), v.literal("inactive")),
			deletedAt: v.optional(v.number()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const server = await ctx.db.get(args.id);
		if (!server) return null;
		return {
			_id: server._id,
			workspaceId: server.workspaceId,
			name: server.name,
			url: server.url,
			transport: server.transport ?? "sse",
			authType: server.authType,
			authConfigUrl: server.authConfigUrl,
			apiKey: server.apiKey,
			enabledTools: server.enabledTools,
			status: server.status,
			deletedAt: server.deletedAt,
		};
	},
});

/** List active MCP servers for a workspace with raw apiKey (for loadMcpTools). */
export const listActiveInternal = internalQuery({
	args: { workspaceId: v.id("workspaces") },
	returns: v.array(
		v.object({
			_id: v.id("mcpServers"),
			name: v.string(),
			url: v.string(),
			transport: v.union(v.literal("http"), v.literal("sse")),
			authType: v.optional(
				v.union(v.literal("none"), v.literal("apiKey"), v.literal("oauth")),
			),
			authConfigUrl: v.optional(v.string()),
			apiKey: v.optional(v.string()),
			enabledTools: v.optional(v.array(v.string())),
		}),
	),
	handler: async (ctx, args) => {
		const servers = await ctx.db
			.query("mcpServers")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		return servers
			.filter((s) => s.status === "active" && !s.deletedAt)
			.map((s) => ({
				_id: s._id,
				name: s.name,
				url: s.url,
				transport: s.transport ?? "sse",
				authType: s.authType,
				authConfigUrl: s.authConfigUrl,
				apiKey: s.apiKey,
				enabledTools: s.enabledTools,
			}));
	},
});

// ── Public Queries ───────────────────────────────────────────────────────

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(mcpServerDoc),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		const servers = await ctx.db
			.query("mcpServers")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		return servers
			.filter((s) => !s.deletedAt)
			.map((s) => ({
				_id: s._id,
				_creationTime: s._creationTime,
				workspaceId: s.workspaceId,
				name: s.name,
				description: s.description,
				url: s.url,
				transport: s.transport ?? "sse",
				authType: s.authType,
				authConfigUrl: s.authConfigUrl,
				hasApiKey: !!s.apiKey,
				enabledTools: s.enabledTools,
				status: s.status,
				createdBy: s.createdBy,
				createdAt: s.createdAt,
				updatedAt: s.updatedAt,
				deletedAt: s.deletedAt,
			}))
			.sort((a, b) => {
				const aSystem = isSystemExcalidrawServer(a);
				const bSystem = isSystemExcalidrawServer(b);
				if (aSystem !== bSystem) return aSystem ? -1 : 1;
				return a.name.localeCompare(b.name);
			});
	},
});

// ── Mutations ────────────────────────────────────────────────────────────

export const add = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.string(),
		url: v.string(),
		transport: v.optional(v.union(v.literal("http"), v.literal("sse"))),
		authType: v.optional(
			v.union(v.literal("none"), v.literal("apiKey"), v.literal("oauth")),
		),
		authConfigUrl: v.optional(v.string()),
		apiKey: v.optional(v.string()),
		description: v.optional(v.string()),
		enabledTools: v.optional(v.array(v.string())),
	},
	returns: v.id("mcpServers"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceAdmin(ctx, args.workspaceId);
		const normalizedAuthType =
			args.authType ?? (args.apiKey ? "apiKey" : "none");
		return await ctx.db.insert("mcpServers", {
			workspaceId: args.workspaceId,
			name: args.name,
			url: args.url,
			transport: args.transport ?? "sse",
			apiKey: args.apiKey,
			authType: normalizedAuthType,
			authConfigUrl:
				normalizedAuthType === "oauth" ? args.authConfigUrl : undefined,
			description: args.description,
			enabledTools: args.enabledTools,
			status: "active",
			createdBy: userId,
			createdAt: Date.now(),
		});
	},
});

export const ensureSystemExcalidrawServer = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.id("mcpServers"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		return await ensureSystemExcalidrawServerDoc(ctx, args.workspaceId, userId);
	},
});

export const ensureSystemExcalidrawServerInternal = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		createdBy: v.optional(v.id("users")),
	},
	returns: v.id("mcpServers"),
	handler: async (ctx, args) => {
		let createdBy = args.createdBy;
		if (!createdBy) {
			const workspace = await ctx.db.get(args.workspaceId);
			if (!workspace) {
				throw new ConvexError("Workspace not found");
			}
			createdBy = workspace.ownerId;
		}
		return await ensureSystemExcalidrawServerDoc(
			ctx,
			args.workspaceId,
			createdBy,
		);
	},
});

export const update = mutation({
	args: {
		id: v.id("mcpServers"),
		name: v.optional(v.string()),
		url: v.optional(v.string()),
		transport: v.optional(v.union(v.literal("http"), v.literal("sse"))),
		authType: v.optional(
			v.union(v.literal("none"), v.literal("apiKey"), v.literal("oauth")),
		),
		authConfigUrl: v.optional(v.string()),
		apiKey: v.optional(v.string()),
		clearApiKey: v.optional(v.boolean()),
		description: v.optional(v.string()),
		enabledTools: v.optional(v.array(v.string())),
		status: v.optional(v.union(v.literal("active"), v.literal("inactive"))),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const server = await ctx.db.get(args.id);
		if (!server || server.deletedAt) {
			throw new ConvexError("MCP server not found");
		}
		await requireWorkspaceAdmin(ctx, server.workspaceId);
		if (isSystemExcalidrawServer(server)) {
			throw new ConvexError(
				"Excalidraw MCP is a required system connector and cannot be edited.",
			);
		}

		const updates: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) updates.name = args.name;
		if (args.url !== undefined) updates.url = args.url;
		if (args.transport !== undefined) updates.transport = args.transport;
		if (args.authType !== undefined) updates.authType = args.authType;
		if (args.authConfigUrl !== undefined)
			updates.authConfigUrl = args.authConfigUrl;
		if (args.clearApiKey) {
			updates.apiKey = undefined;
		} else if (args.apiKey !== undefined) {
			updates.apiKey = args.apiKey;
		}
		if (args.description !== undefined) updates.description = args.description;
		if (args.enabledTools !== undefined)
			updates.enabledTools = args.enabledTools;
		if (args.status !== undefined) updates.status = args.status;
		if (args.authType === "none") {
			updates.authConfigUrl = undefined;
		}
		if (args.authType === "apiKey" && args.authConfigUrl === undefined) {
			updates.authConfigUrl = undefined;
		}

		await ctx.db.patch(args.id, updates);
		return null;
	},
});

/**
 * One-off migration helper:
 * Set transport to HTTP for in-app Excalidraw MCP system entries.
 */
export const migrateExcalidrawToHttp = internalMutation({
	args: {
		workspaceId: v.optional(v.id("workspaces")),
	},
	returns: v.object({
		updated: v.number(),
	}),
	handler: async (ctx, args) => {
		const workspaceId = args.workspaceId;
		const servers = workspaceId
			? await ctx.db
					.query("mcpServers")
					.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
					.collect()
			: await ctx.db.query("mcpServers").collect();

		let updated = 0;
		for (const server of servers) {
			const lowerName = server.name.toLowerCase();
			const lowerUrl = server.url.toLowerCase();
			const isExcalidrawSystemServer =
				lowerName.includes("excalidraw") ||
				lowerUrl.includes("/api/mcp/excalidraw") ||
				lowerUrl.includes("/mcp/excalidraw");
			if (!isExcalidrawSystemServer) continue;
			if (server.transport === "http") continue;
			await ctx.db.patch(server._id, {
				transport: "http",
				updatedAt: Date.now(),
			});
			updated += 1;
		}

		return { updated };
	},
});

export const remove = mutation({
	args: {
		id: v.id("mcpServers"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const server = await ctx.db.get(args.id);
		if (!server || server.deletedAt) {
			throw new ConvexError("MCP server not found");
		}
		await requireWorkspaceAdmin(ctx, server.workspaceId);
		if (isSystemExcalidrawServer(server)) {
			throw new ConvexError(
				"Excalidraw MCP is a required system connector and cannot be removed.",
			);
		}
		await ctx.db.patch(args.id, { deletedAt: Date.now() });
		return null;
	},
});
