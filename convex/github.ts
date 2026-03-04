import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
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
			issueSyncEnabled: v.optional(v.boolean()),
			prSyncEnabled: v.optional(v.boolean()),
			commitSyncEnabled: v.optional(v.boolean()),
			lastPrSyncAt: v.optional(v.number()),
			lastIssueSyncAt: v.optional(v.number()),
			lastCommitSyncAt: v.optional(v.number()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) throw new ConvexError("Project not found");

		await requireWorkspaceMember(ctx, project.workspaceId);

		const connections = await ctx.db
			.query("githubConnections")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		// Prefer the most recent active connection, fall back to most recent non-disconnected
		const connection =
			connections.find((c) => c.status === "active") ??
			connections.filter((c) => c.status !== "disconnected").pop() ??
			null;

		if (!connection) return null;

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
			issueSyncEnabled: connection.issueSyncEnabled,
			prSyncEnabled: connection.prSyncEnabled,
			commitSyncEnabled: connection.commitSyncEnabled,
			lastPrSyncAt: connection.lastPrSyncAt,
			lastIssueSyncAt: connection.lastIssueSyncAt,
			lastCommitSyncAt: connection.lastCommitSyncAt,
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

/** Get all GitHub connections for a project (non-disconnected). */
export const getProjectConnections = query({
	args: {
		projectId: v.id("projects"),
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
			updatedAt: v.optional(v.number()),
			issueSyncEnabled: v.optional(v.boolean()),
			prSyncEnabled: v.optional(v.boolean()),
			commitSyncEnabled: v.optional(v.boolean()),
			lastPrSyncAt: v.optional(v.number()),
			lastIssueSyncAt: v.optional(v.number()),
			lastCommitSyncAt: v.optional(v.number()),
		}),
	),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) throw new ConvexError("Project not found");

		await requireWorkspaceMember(ctx, project.workspaceId);

		const connections = await ctx.db
			.query("githubConnections")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
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
				updatedAt: c.updatedAt,
				issueSyncEnabled: c.issueSyncEnabled,
				prSyncEnabled: c.prSyncEnabled,
				commitSyncEnabled: c.commitSyncEnabled,
				lastPrSyncAt: c.lastPrSyncAt,
				lastIssueSyncAt: c.lastIssueSyncAt,
				lastCommitSyncAt: c.lastCommitSyncAt,
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

		// Disconnect this specific connection
		if (connection.webhookId) {
			await ctx.scheduler.runAfter(0, deregisterWebhookRef, {
				connectionId: connection._id,
			});
		}

		await ctx.db.patch(connection._id, {
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

		// Check for duplicate — same repo already connected to this project
		const existing = await ctx.db
			.query("githubConnections")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		const duplicate = existing.find(
			(c) =>
				c.status !== "disconnected" &&
				c.repoOwner === args.repoOwner &&
				c.repoName === args.repoName,
		);
		if (duplicate) {
			throw new ConvexError("Repository already connected");
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

		// Schedule code indexing
		await ctx.scheduler.runAfter(0, indexRepositoryRef, {
			projectId: args.projectId,
		});

		// Schedule webhook registration
		await ctx.scheduler.runAfter(0, registerWebhookRef, {
			connectionId: args.connectionId,
			projectId: args.projectId,
		});

		// Schedule PR and commit sync
		await ctx.scheduler.runAfter(
			0,
			internal.githubSyncActions.syncPullRequestsFromGithub,
			{ connectionId: args.connectionId },
		);
		await ctx.scheduler.runAfter(
			0,
			internal.githubSyncActions.syncCommitsFromGithub,
			{ connectionId: args.connectionId },
		);

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

/** Update sync feature flags for a connection. */
export const updateSyncSettings = mutation({
	args: {
		connectionId: v.id("githubConnections"),
		issueSyncEnabled: v.optional(v.boolean()),
		prSyncEnabled: v.optional(v.boolean()),
		commitSyncEnabled: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		if (!connection) throw new ConvexError("Connection not found");
		await requireWorkspaceAdmin(ctx, connection.workspaceId);

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.issueSyncEnabled !== undefined)
			patch.issueSyncEnabled = args.issueSyncEnabled;
		if (args.prSyncEnabled !== undefined)
			patch.prSyncEnabled = args.prSyncEnabled;
		if (args.commitSyncEnabled !== undefined)
			patch.commitSyncEnabled = args.commitSyncEnabled;

		await ctx.db.patch(args.connectionId, patch);
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
