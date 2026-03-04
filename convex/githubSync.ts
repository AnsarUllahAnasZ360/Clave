/**
 * GitHub Sync Engine — Pull Requests, Commits, and Two-Way Issue Sync.
 *
 * Queries, mutations, internal queries, and internal mutations.
 * Actions that need Node.js (GitHub API calls) are in githubSyncActions.ts.
 */

import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";
import { fractionalIndex, generateIdentifier } from "./lib/utils";

// ── Shared Validators ────────────────────────────────────────────────────

const prStateValidator = v.union(
	v.literal("open"),
	v.literal("closed"),
	v.literal("merged"),
	v.literal("draft"),
);

const reviewDecisionValidator = v.optional(
	v.union(
		v.literal("approved"),
		v.literal("changes_requested"),
		v.literal("review_required"),
		v.literal("pending"),
	),
);

const syncSourceValidator = v.union(
	v.literal("github"),
	v.literal("clave"),
	v.literal("initial"),
);

const syncStatusValidator = v.union(
	v.literal("synced"),
	v.literal("conflict"),
	v.literal("error"),
);

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC QUERIES
// ══════════════════════════════════════════════════════════════════════════

/** List pull requests for a project with optional state filter. Only returns PRs from the active connection. */
export const listPullRequests = query({
	args: {
		projectId: v.id("projects"),
		connectionId: v.optional(v.id("githubConnections")),
		state: v.optional(prStateValidator),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) throw new ConvexError("Project not found");
		await requireWorkspaceMember(ctx, project.workspaceId);

		const connections = await ctx.db
			.query("githubConnections")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		const activeConnection = args.connectionId
			? connections.find((c) => c._id === args.connectionId)
			: [...connections]
					.filter((c) => c.status === "active")
					.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
		if (!activeConnection) return [];

		let prs;
		if (args.state) {
			prs = await ctx.db
				.query("githubPullRequests")
				.withIndex("by_project_state", (idx) =>
					idx.eq("projectId", args.projectId).eq("state", args.state!),
				)
				.order("desc")
				.take((args.limit ?? 50) * 2);
		} else {
			prs = await ctx.db
				.query("githubPullRequests")
				.withIndex("by_project", (idx) => idx.eq("projectId", args.projectId))
				.order("desc")
				.take((args.limit ?? 50) * 2);
		}

		const filtered = prs.filter(
			(pr) => pr.connectionId === activeConnection._id,
		);
		return filtered.slice(0, args.limit ?? 50);
	},
});

/** Get a single pull request by ID. */
export const getPullRequest = query({
	args: { prId: v.id("githubPullRequests") },
	handler: async (ctx, args) => {
		const pr = await ctx.db.get(args.prId);
		if (!pr) throw new ConvexError("Pull request not found");
		const project = await ctx.db.get(pr.projectId);
		if (!project) throw new ConvexError("Project not found");
		await requireWorkspaceMember(ctx, project.workspaceId);
		return pr;
	},
});

/** List commits for a project, ordered by committed date descending. Only returns commits from the active connection. */
export const listCommits = query({
	args: {
		projectId: v.id("projects"),
		connectionId: v.optional(v.id("githubConnections")),
		limit: v.optional(v.number()),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) throw new ConvexError("Project not found");
		await requireWorkspaceMember(ctx, project.workspaceId);

		const connections = await ctx.db
			.query("githubConnections")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		const activeConnection = args.connectionId
			? connections.find((c) => c._id === args.connectionId)
			: [...connections]
					.filter((c) => c.status === "active")
					.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
		if (!activeConnection) return [];

		const commits = await ctx.db
			.query("githubCommits")
			.withIndex("by_project_committed", (idx) =>
				idx.eq("projectId", args.projectId),
			)
			.order("desc")
			.take((args.limit ?? 50) * 2);

		return commits
			.filter((c) => c.connectionId === activeConnection._id)
			.slice(0, args.limit ?? 50);
	},
});

/** List PRs linked to a specific Clave issue. Only returns PRs from the project's active connection. */
export const listLinkedPrs = query({
	args: { issueId: v.id("issues") },
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue) throw new ConvexError("Issue not found");
		await requireWorkspaceMember(ctx, issue.workspaceId);

		const linkedPrs = await ctx.db
			.query("githubPullRequests")
			.withIndex("by_linked_issue", (idx) =>
				idx.eq("linkedIssueId", args.issueId),
			)
			.collect();

		if (!issue.projectId) return linkedPrs;

		const connections = await ctx.db
			.query("githubConnections")
			.withIndex("by_project", (q) => q.eq("projectId", issue.projectId!))
			.collect();
		const active = [...connections]
			.filter((c) => c.status === "active")
			.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0];
		if (!active) return [];

		return linkedPrs.filter((pr) => pr.connectionId === active._id);
	},
});

/** List commits linked to a specific Clave issue (directly or via linked PRs). Only returns commits from the project's active connection. */
export const listLinkedCommits = query({
	args: { issueId: v.id("issues") },
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue) throw new ConvexError("Issue not found");
		await requireWorkspaceMember(ctx, issue.workspaceId);

		const activeConnectionId = issue.projectId
			? [...(await ctx.db
					.query("githubConnections")
					.withIndex("by_project", (q) =>
						q.eq("projectId", issue.projectId!),
					)
					.collect())]
					.filter((c) => c.status === "active")
					.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0))[0]?._id
			: null;

		// Get commits directly linked to issue
		const directCommits = await ctx.db
			.query("githubCommits")
			.withIndex("by_linked_issue", (idx) =>
				idx.eq("linkedIssueId", args.issueId),
			)
			.collect();

		// Get commits linked via PRs
		const linkedPrs = await ctx.db
			.query("githubPullRequests")
			.withIndex("by_linked_issue", (idx) =>
				idx.eq("linkedIssueId", args.issueId),
			)
			.collect();

		const prsFromActiveConnection =
			activeConnectionId === null
				? linkedPrs
				: linkedPrs.filter((pr) => pr.connectionId === activeConnectionId);

		const prCommitSets = await Promise.all(
			prsFromActiveConnection.map((pr) =>
				ctx.db
					.query("githubCommits")
					.withIndex("by_pull_request", (idx) =>
						idx.eq("pullRequestId", pr._id),
					)
					.collect(),
			),
		);

		const directFromActive =
			activeConnectionId === null
				? directCommits
				: directCommits.filter((c) => c.connectionId === activeConnectionId);

		// Merge and deduplicate by sha
		const allCommits = [...directFromActive, ...prCommitSets.flat()];
		const seen = new Set<string>();
		const unique = allCommits.filter((c) => {
			if (seen.has(c.sha)) return false;
			seen.add(c.sha);
			return true;
		});

		// Sort by committed date descending
		unique.sort((a, b) => b.committedAt - a.committedAt);
		return unique.slice(0, 30);
	},
});

/** List issue sync mappings for admin view. */
export const listIssueSyncMappings = query({
	args: { projectId: v.id("projects") },
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) throw new ConvexError("Project not found");
		await requireWorkspaceMember(ctx, project.workspaceId);

		return await ctx.db
			.query("githubIssueSync")
			.withIndex("by_project", (idx) => idx.eq("projectId", args.projectId))
			.collect();
	},
});

// ══════════════════════════════════════════════════════════════════════════
// PUBLIC MUTATIONS
// ══════════════════════════════════════════════════════════════════════════

/** Manually link a PR to a Clave issue. */
export const manualLinkPr = mutation({
	args: {
		prId: v.id("githubPullRequests"),
		issueId: v.id("issues"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const pr = await ctx.db.get(args.prId);
		if (!pr) throw new ConvexError("Pull request not found");
		const issue = await ctx.db.get(args.issueId);
		if (!issue) throw new ConvexError("Issue not found");
		await requireWorkspaceMember(ctx, pr.workspaceId);

		if (pr.workspaceId !== issue.workspaceId) {
			throw new ConvexError("PR and issue must be in the same workspace");
		}

		await ctx.db.patch(args.prId, { linkedIssueId: args.issueId });
		return null;
	},
});

/** Unlink a PR from its Clave issue. */
export const manualUnlinkPr = mutation({
	args: { prId: v.id("githubPullRequests") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const pr = await ctx.db.get(args.prId);
		if (!pr) throw new ConvexError("Pull request not found");
		await requireWorkspaceMember(ctx, pr.workspaceId);

		await ctx.db.patch(args.prId, { linkedIssueId: undefined });
		return null;
	},
});

/** Enable or disable two-way issue sync for a connection. */
export const toggleIssueSync = mutation({
	args: {
		connectionId: v.id("githubConnections"),
		enabled: v.boolean(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		if (!connection) throw new ConvexError("Connection not found");
		await requireWorkspaceMember(ctx, connection.workspaceId);

		await ctx.db.patch(args.connectionId, {
			issueSyncEnabled: args.enabled,
			updatedAt: Date.now(),
		});
		return null;
	},
});

// ══════════════════════════════════════════════════════════════════════════
// INTERNAL QUERIES
// ══════════════════════════════════════════════════════════════════════════

/** Get active connections (used by cron). */
export const getActiveConnectionsForSync = internalQuery({
	args: {},
	handler: async (ctx) => {
		const connections = await ctx.db.query("githubConnections").collect();
		return connections.filter((c) => c.status === "active");
	},
});

/** Resolve a Clave issue identifier to an issue ID. */
export const resolveIssueByIdentifier = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		identifier: v.string(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("issues")
			.withIndex("by_identifier", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("identifier", args.identifier.toUpperCase()),
			)
			.unique();
	},
});

/** Look up issue sync record by GitHub issue ID. */
export const getIssueSyncByGithubId = internalQuery({
	args: {
		connectionId: v.id("githubConnections"),
		githubIssueId: v.number(),
	},
	handler: async (ctx, args) => {
		return await ctx.db
			.query("githubIssueSync")
			.withIndex("by_github_issue", (q) =>
				q
					.eq("connectionId", args.connectionId)
					.eq("githubIssueId", args.githubIssueId),
			)
			.unique();
	},
});

/** Look up issue sync record by Clave issue ID. */
export const getIssueSyncByClaveId = internalQuery({
	args: { claveIssueId: v.id("issues") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("githubIssueSync")
			.withIndex("by_clave_issue", (q) =>
				q.eq("claveIssueId", args.claveIssueId),
			)
			.first();
	},
});

/** Get connection creator user ID. */
export const getConnectionCreator = internalQuery({
	args: { connectionId: v.id("githubConnections") },
	handler: async (ctx, args) => {
		const connection = await ctx.db.get(args.connectionId);
		if (!connection) return null;
		return { createdBy: connection.createdBy };
	},
});

/** Get sync record by ID. */
export const getSyncRecordById = internalQuery({
	args: { syncRecordId: v.id("githubIssueSync") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.syncRecordId);
	},
});

/** Get issue by ID (for outbound sync). */
export const getIssueById = internalQuery({
	args: { issueId: v.id("issues") },
	handler: async (ctx, args) => {
		return await ctx.db.get(args.issueId);
	},
});

/** Get workspace settings (for issue prefix). */
export const getWorkspaceSettings = internalQuery({
	args: { workspaceId: v.id("workspaces") },
	handler: async (ctx, args) => {
		return await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();
	},
});

// ══════════════════════════════════════════════════════════════════════════
// INTERNAL MUTATIONS
// ══════════════════════════════════════════════════════════════════════════

/** Upsert a pull request from webhook or API sync. */
export const upsertPullRequest = internalMutation({
	args: {
		connectionId: v.id("githubConnections"),
		projectId: v.id("projects"),
		workspaceId: v.id("workspaces"),
		githubId: v.number(),
		number: v.number(),
		title: v.string(),
		body: v.optional(v.string()),
		state: prStateValidator,
		authorLogin: v.string(),
		authorAvatarUrl: v.optional(v.string()),
		headBranch: v.string(),
		baseBranch: v.string(),
		htmlUrl: v.string(),
		isDraft: v.boolean(),
		mergedAt: v.optional(v.number()),
		closedAt: v.optional(v.number()),
		reviewDecision: reviewDecisionValidator,
		linkedIssueId: v.optional(v.id("issues")),
		githubCreatedAt: v.number(),
		githubUpdatedAt: v.number(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("githubPullRequests")
			.withIndex("by_github_id", (q) =>
				q.eq("connectionId", args.connectionId).eq("githubId", args.githubId),
			)
			.unique();

		const now = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				title: args.title,
				body: args.body,
				state: args.state,
				authorLogin: args.authorLogin,
				authorAvatarUrl: args.authorAvatarUrl,
				headBranch: args.headBranch,
				baseBranch: args.baseBranch,
				htmlUrl: args.htmlUrl,
				isDraft: args.isDraft,
				mergedAt: args.mergedAt,
				closedAt: args.closedAt,
				reviewDecision: args.reviewDecision,
				linkedIssueId: args.linkedIssueId ?? existing.linkedIssueId,
				githubUpdatedAt: args.githubUpdatedAt,
				syncedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("githubPullRequests", {
			...args,
			syncedAt: now,
		});
	},
});

/** Upsert a commit from webhook or API sync. */
export const upsertCommit = internalMutation({
	args: {
		connectionId: v.id("githubConnections"),
		projectId: v.id("projects"),
		workspaceId: v.id("workspaces"),
		sha: v.string(),
		message: v.string(),
		authorLogin: v.string(),
		authorEmail: v.optional(v.string()),
		authorAvatarUrl: v.optional(v.string()),
		htmlUrl: v.string(),
		pullRequestId: v.optional(v.id("githubPullRequests")),
		linkedIssueId: v.optional(v.id("issues")),
		committedAt: v.number(),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("githubCommits")
			.withIndex("by_sha", (q) =>
				q.eq("connectionId", args.connectionId).eq("sha", args.sha),
			)
			.unique();

		const now = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				message: args.message,
				authorLogin: args.authorLogin,
				authorEmail: args.authorEmail,
				authorAvatarUrl: args.authorAvatarUrl,
				pullRequestId: args.pullRequestId ?? existing.pullRequestId,
				linkedIssueId: args.linkedIssueId ?? existing.linkedIssueId,
				syncedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("githubCommits", {
			...args,
			syncedAt: now,
		});
	},
});

/** Upsert an issue sync mapping. */
export const upsertIssueSync = internalMutation({
	args: {
		connectionId: v.id("githubConnections"),
		projectId: v.id("projects"),
		workspaceId: v.id("workspaces"),
		githubIssueId: v.number(),
		githubIssueNumber: v.number(),
		githubIssueUrl: v.string(),
		claveIssueId: v.id("issues"),
		lastGithubUpdatedAt: v.optional(v.string()),
		lastClaveUpdatedAt: v.optional(v.number()),
		syncSource: syncSourceValidator,
		syncStatus: syncStatusValidator,
		errorMessage: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const existing = await ctx.db
			.query("githubIssueSync")
			.withIndex("by_github_issue", (q) =>
				q
					.eq("connectionId", args.connectionId)
					.eq("githubIssueId", args.githubIssueId),
			)
			.unique();

		const now = Date.now();
		if (existing) {
			await ctx.db.patch(existing._id, {
				lastGithubUpdatedAt:
					args.lastGithubUpdatedAt ?? existing.lastGithubUpdatedAt,
				lastClaveUpdatedAt:
					args.lastClaveUpdatedAt ?? existing.lastClaveUpdatedAt,
				syncSource: args.syncSource,
				syncStatus: args.syncStatus,
				errorMessage: args.errorMessage,
				syncedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("githubIssueSync", {
			...args,
			syncedAt: now,
		});
	},
});

/** Create a Clave issue from a GitHub issue (inbound sync). */
export const createIssueFromGithub = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		projectId: v.optional(v.id("projects")),
		title: v.string(),
		description: v.optional(v.string()),
		status: v.optional(v.string()),
		createdBy: v.id("users"),
	},
	handler: async (ctx, args) => {
		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.unique();
		if (!settings) throw new ConvexError("Workspace settings not found");

		const prefix = settings.issuePrefix ?? settings.storyPrefix;
		const nextNumber = settings.nextIssueNumber ?? 1;
		const identifier = generateIdentifier(prefix, nextNumber);
		await ctx.db.patch(settings._id, {
			issuePrefix: prefix,
			nextIssueNumber: nextNumber + 1,
		});

		const status = args.status ?? "triage";
		const issueId = await ctx.db.insert("issues", {
			workspaceId: args.workspaceId,
			projectId: args.projectId,
			identifier,
			title: args.title,
			description: args.description,
			status,
			priority: "no_priority",
			type: "issue",
			sortOrder: fractionalIndex(null, null),
			createdBy: args.createdBy,
			githubSyncSource: "github",
		});

		await ctx.scheduler.runAfter(
			0,
			internal.ai.indexing.issueIndexer.indexIssue,
			{ issueId },
		);

		return { issueId, identifier };
	},
});

/** Update a Clave issue from GitHub data (inbound sync). */
export const updateIssueFromGithub = internalMutation({
	args: {
		issueId: v.id("issues"),
		title: v.optional(v.string()),
		description: v.optional(v.string()),
		status: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const issue = await ctx.db.get(args.issueId);
		if (!issue || issue.deletedAt) return;

		const patch: Record<string, unknown> = {
			githubSyncSource: "github",
			updatedAt: Date.now(),
		};
		if (args.title !== undefined) patch.title = args.title;
		if (args.description !== undefined) patch.description = args.description;
		if (args.status !== undefined) {
			patch.status = args.status;
			if (args.status === "done" || args.status === "cancelled") {
				patch.completedAt = Date.now();
			} else if (issue.status === "done" || issue.status === "cancelled") {
				patch.completedAt = undefined;
			}
		}

		await ctx.db.patch(args.issueId, patch);

		await ctx.scheduler.runAfter(
			0,
			internal.ai.indexing.issueIndexer.indexIssue,
			{ issueId: args.issueId },
		);
	},
});

/** Update last PR sync timestamp. */
export const updateLastPrSync = internalMutation({
	args: { connectionId: v.id("githubConnections") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.connectionId, {
			lastPrSyncAt: Date.now(),
			updatedAt: Date.now(),
		});
	},
});

/** Update last commit sync timestamp. */
export const updateLastCommitSync = internalMutation({
	args: { connectionId: v.id("githubConnections") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.connectionId, {
			lastCommitSyncAt: Date.now(),
			updatedAt: Date.now(),
		});
	},
});

/** Update last issue sync timestamp. */
export const updateLastIssueSync = internalMutation({
	args: { connectionId: v.id("githubConnections") },
	handler: async (ctx, args) => {
		await ctx.db.patch(args.connectionId, {
			lastIssueSyncAt: Date.now(),
			updatedAt: Date.now(),
		});
	},
});
