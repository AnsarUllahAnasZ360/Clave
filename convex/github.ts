import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "./lib/auth";

// Reference to the indexer action (new file, not yet in generated types)
const indexRepositoryRef = makeFunctionReference<
	"action",
	{ projectId: Id<"projects"> },
	null
>("ai/indexing/githubIndexer:indexRepository");

// Reference to webhook registration action
const registerWebhookRef = makeFunctionReference<
	"action",
	{ connectionId: Id<"githubConnections">; projectId: Id<"projects"> },
	null
>("ai/indexing/githubWebhook:registerWebhook");

// Reference to webhook deregistration action
const deregisterWebhookRef = makeFunctionReference<
	"action",
	{ connectionId: Id<"githubConnections"> },
	null
>("ai/indexing/githubWebhook:deregisterWebhook");

// ── Public Queries ───────────────────────────────────────────────────────

/** Get the GitHub connection for a specific project (null if none). */
export const getConnection = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.union(
		v.object({
			_id: v.id("githubConnections"),
			projectId: v.id("projects"),
			repoOwner: v.string(),
			repoName: v.string(),
			defaultBranch: v.string(),
			status: v.union(
				v.literal("active"),
				v.literal("disconnected"),
				v.literal("error"),
			),
			lastSyncAt: v.optional(v.number()),
			createdAt: v.number(),
			updatedAt: v.optional(v.number()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) throw new ConvexError("Project not found");

		await requireWorkspaceMember(ctx, project.workspaceId);

		const connection = await ctx.db
			.query("githubConnections")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.first();

		if (!connection || connection.status === "disconnected") return null;

		return {
			_id: connection._id,
			projectId: connection.projectId,
			repoOwner: connection.repoOwner,
			repoName: connection.repoName,
			defaultBranch: connection.defaultBranch,
			status: connection.status,
			lastSyncAt: connection.lastSyncAt,
			createdAt: connection.createdAt,
			updatedAt: connection.updatedAt,
		};
	},
});

/** List all GitHub connections in a workspace (admin only). */
export const listConnections = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(
		v.object({
			_id: v.id("githubConnections"),
			projectId: v.id("projects"),
			repoOwner: v.string(),
			repoName: v.string(),
			defaultBranch: v.string(),
			status: v.union(
				v.literal("active"),
				v.literal("disconnected"),
				v.literal("error"),
			),
			lastSyncAt: v.optional(v.number()),
			createdAt: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);

		const connections = await ctx.db
			.query("githubConnections")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		return connections
			.filter((c) => c.status !== "disconnected")
			.map((c) => ({
				_id: c._id,
				projectId: c.projectId,
				repoOwner: c.repoOwner,
				repoName: c.repoName,
				defaultBranch: c.defaultBranch,
				status: c.status,
				lastSyncAt: c.lastSyncAt,
				createdAt: c.createdAt,
			}));
	},
});

// ── Public Mutations ─────────────────────────────────────────────────────

/** Disconnect a GitHub repository from a project (admin only). */
export const disconnectRepo = mutation({
	args: {
		connectionId: v.id("githubConnections"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		if (!connection) throw new ConvexError("Connection not found");

		await requireWorkspaceAdmin(ctx, connection.workspaceId);

		// Schedule webhook deregistration before disconnecting
		if (connection.webhookId) {
			await ctx.scheduler.runAfter(0, deregisterWebhookRef, {
				connectionId: args.connectionId,
			});
		}

		await ctx.db.patch(args.connectionId, {
			status: "disconnected",
			updatedAt: Date.now(),
		});

		return null;
	},
});

/** Store a new GitHub connection after OAuth callback (admin only). */
export const storeConnection = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		projectId: v.id("projects"),
		repoOwner: v.string(),
		repoName: v.string(),
		defaultBranch: v.string(),
		encryptedToken: v.string(),
		tokenType: v.string(),
		scope: v.string(),
	},
	returns: v.id("githubConnections"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceAdmin(ctx, args.workspaceId);

		// Remove any existing connection for this project first
		const existing = await ctx.db
			.query("githubConnections")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				status: "disconnected",
				updatedAt: Date.now(),
			});
		}

		return await ctx.db.insert("githubConnections", {
			workspaceId: args.workspaceId,
			projectId: args.projectId,
			repoOwner: args.repoOwner,
			repoName: args.repoName,
			defaultBranch: args.defaultBranch,
			accessToken: args.encryptedToken,
			tokenType: args.tokenType,
			scope: args.scope,
			status: "active",
			createdBy: userId,
			createdAt: Date.now(),
		});
	},
});

/** Trigger initial repository indexing and webhook registration after OAuth connection. */
export const triggerInitialIndex = mutation({
	args: {
		connectionId: v.id("githubConnections"),
		projectId: v.id("projects"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		if (!connection) throw new ConvexError("Connection not found");

		await requireWorkspaceMember(ctx, connection.workspaceId);

		// Schedule indexing to run immediately
		await ctx.scheduler.runAfter(0, indexRepositoryRef, {
			projectId: args.projectId,
		});

		// Schedule webhook registration (runs after indexing starts)
		await ctx.scheduler.runAfter(0, registerWebhookRef, {
			connectionId: args.connectionId,
			projectId: args.projectId,
		});

		return null;
	},
});

// ── Internal Mutations (called from Convex actions) ─────────────────────

/** Update webhook ID and secret after webhook registration. */
export const updateWebhookId = internalMutation({
	args: {
		connectionId: v.id("githubConnections"),
		webhookId: v.number(),
		webhookSecret: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.connectionId, {
			webhookId: args.webhookId,
			webhookSecret: args.webhookSecret,
			updatedAt: Date.now(),
		});
		return null;
	},
});

/** Update last sync timestamp after indexing completes. */
export const updateLastSync = internalMutation({
	args: {
		connectionId: v.id("githubConnections"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.connectionId, {
			lastSyncAt: Date.now(),
			updatedAt: Date.now(),
		});
		return null;
	},
});

/** Update connection status (e.g. to "error" when token becomes invalid). */
export const updateStatus = internalMutation({
	args: {
		connectionId: v.id("githubConnections"),
		status: v.union(
			v.literal("active"),
			v.literal("disconnected"),
			v.literal("error"),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.connectionId, {
			status: args.status,
			updatedAt: Date.now(),
		});
		return null;
	},
});

/** Get connection with encrypted token (for internal actions that need to make GitHub API calls). */
export const getConnectionInternal = internalMutation({
	args: {
		connectionId: v.id("githubConnections"),
	},
	returns: v.union(
		v.object({
			_id: v.id("githubConnections"),
			workspaceId: v.id("workspaces"),
			projectId: v.id("projects"),
			repoOwner: v.string(),
			repoName: v.string(),
			defaultBranch: v.string(),
			accessToken: v.string(),
			status: v.union(
				v.literal("active"),
				v.literal("disconnected"),
				v.literal("error"),
			),
			webhookId: v.optional(v.number()),
			webhookSecret: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		if (!connection) return null;

		return {
			_id: connection._id,
			workspaceId: connection.workspaceId,
			projectId: connection.projectId,
			repoOwner: connection.repoOwner,
			repoName: connection.repoName,
			defaultBranch: connection.defaultBranch,
			accessToken: connection.accessToken,
			status: connection.status,
			webhookId: connection.webhookId,
			webhookSecret: connection.webhookSecret,
		};
	},
});
