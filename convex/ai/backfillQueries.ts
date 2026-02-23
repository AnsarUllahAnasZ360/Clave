/**
 * RAG Backfill — Queries and mutations for backfill job management.
 *
 * This file contains:
 * - Internal queries to list project content for backfilling
 * - Internal mutations to manage backfill job progress
 * - Public mutation to start a backfill
 * - Public query to get backfill status
 *
 * The actual backfill action ("use node") is in backfill.ts.
 */
import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "../_generated/server";

// Function reference for the backfill action (not yet in generated types)
const runBackfillRef = makeFunctionReference<
	"action",
	{ projectId: Id<"projects">; jobId: Id<"ragBackfillJobs"> },
	null
>("ai/backfill:runBackfill");

import { requireAuth, requireWorkspaceMember } from "../lib/auth";

// ── Internal Queries — List content by project ──────────────────────────

/**
 * List all non-deleted issue IDs for a project.
 */
export const listProjectIssueIds = internalQuery({
	args: { projectId: v.id("projects") },
	returns: v.array(v.id("issues")),
	handler: async (ctx, args) => {
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		return issues.filter((i) => !i.deletedAt).map((i) => i._id);
	},
});

/**
 * List all non-deleted document IDs for a project.
 */
export const listProjectDocumentIds = internalQuery({
	args: { projectId: v.id("projects") },
	returns: v.array(v.id("documents")),
	handler: async (ctx, args) => {
		const docs = await ctx.db
			.query("documents")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		return docs.filter((d) => !d.deletedAt).map((d) => d._id);
	},
});

/**
 * List all non-deleted comment IDs for a given issue.
 */
export const listIssueCommentIds = internalQuery({
	args: { issueId: v.id("issues") },
	returns: v.array(v.id("comments")),
	handler: async (ctx, args) => {
		const comments = await ctx.db
			.query("comments")
			.withIndex("by_issue", (q) => q.eq("issueId", args.issueId))
			.collect();
		return comments.filter((c) => !c.deletedAt).map((c) => c._id);
	},
});

// ── Internal Mutations — Job management ─────────────────────────────────

/**
 * Create a new backfill job record.
 */
export const createBackfillJob = internalMutation({
	args: {
		projectId: v.id("projects"),
		startedBy: v.id("users"),
	},
	returns: v.id("ragBackfillJobs"),
	handler: async (ctx, args) => {
		return await ctx.db.insert("ragBackfillJobs", {
			projectId: args.projectId,
			status: "running",
			startedAt: Date.now(),
			startedBy: args.startedBy,
		});
	},
});

/**
 * Update progress counters on a backfill job.
 */
export const updateBackfillProgress = internalMutation({
	args: {
		jobId: v.id("ragBackfillJobs"),
		issuesTotal: v.optional(v.number()),
		issuesIndexed: v.optional(v.number()),
		documentsTotal: v.optional(v.number()),
		documentsIndexed: v.optional(v.number()),
		notesTotal: v.optional(v.number()),
		notesIndexed: v.optional(v.number()),
		commentsTotal: v.optional(v.number()),
		commentsIndexed: v.optional(v.number()),
		completedPhases: v.optional(v.array(v.string())),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { jobId, ...updates } = args;
		// Filter out undefined values
		const patch: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(updates)) {
			if (value !== undefined) {
				patch[key] = value;
			}
		}
		if (Object.keys(patch).length > 0) {
			await ctx.db.patch(jobId, patch);
		}
		return null;
	},
});

/**
 * Mark a backfill job as completed or failed.
 */
export const completeBackfillJob = internalMutation({
	args: {
		jobId: v.id("ragBackfillJobs"),
		status: v.union(v.literal("completed"), v.literal("failed")),
		error: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await ctx.db.patch(args.jobId, {
			status: args.status,
			completedAt: Date.now(),
			error: args.error,
		});
		return null;
	},
});

/**
 * Get the backfill job record for checkpoint resumability.
 */
export const getBackfillJob = internalQuery({
	args: { jobId: v.id("ragBackfillJobs") },
	returns: v.union(
		v.object({
			_id: v.id("ragBackfillJobs"),
			_creationTime: v.number(),
			projectId: v.id("projects"),
			status: v.union(
				v.literal("running"),
				v.literal("completed"),
				v.literal("failed"),
			),
			startedAt: v.number(),
			completedAt: v.optional(v.number()),
			startedBy: v.id("users"),
			issuesTotal: v.optional(v.number()),
			issuesIndexed: v.optional(v.number()),
			documentsTotal: v.optional(v.number()),
			documentsIndexed: v.optional(v.number()),
			commentsTotal: v.optional(v.number()),
			commentsIndexed: v.optional(v.number()),
			completedPhases: v.optional(v.array(v.string())),
			error: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.jobId);
	},
});

// ── Public API ──────────────────────────────────────────────────────────

/**
 * Start a backfill job for a project.
 * Requires workspace admin OR project lead.
 */
export const startBackfill = mutation({
	args: { projectId: v.id("projects") },
	returns: v.id("ragBackfillJobs"),
	handler: async (ctx, args) => {
		const userId = await requireAuth(ctx);

		// Get the project to find workspaceId and leadId
		const project = await ctx.db.get(args.projectId);
		if (!project) throw new ConvexError("Project not found");
		if (project.deletedAt) throw new ConvexError("Project has been deleted");

		// Check workspace membership
		const { member } = await requireWorkspaceMember(ctx, project.workspaceId);

		// Require admin or project lead
		const isAdmin = member.role === "admin";
		const isLead = project.leadId === userId;
		if (!isAdmin && !isLead) {
			throw new ConvexError(
				"Only workspace admins or project leads can trigger backfill",
			);
		}

		// Check for already-running job
		const existingJobs = await ctx.db
			.query("ragBackfillJobs")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		const runningJob = existingJobs.find((j) => j.status === "running");
		if (runningJob) {
			throw new ConvexError("Backfill already in progress for this project");
		}

		// Create job record
		const jobId = await ctx.db.insert("ragBackfillJobs", {
			projectId: args.projectId,
			status: "running",
			startedAt: Date.now(),
			startedBy: userId,
		});

		// Schedule the backfill action
		await ctx.scheduler.runAfter(0, runBackfillRef, {
			projectId: args.projectId,
			jobId,
		});

		return jobId;
	},
});

/**
 * Get the latest backfill status for a project.
 * Returns the most recent job with computed progress percentage.
 */
export const getBackfillStatus = query({
	args: { projectId: v.id("projects") },
	returns: v.union(
		v.object({
			_id: v.id("ragBackfillJobs"),
			status: v.union(
				v.literal("running"),
				v.literal("completed"),
				v.literal("failed"),
			),
			startedAt: v.number(),
			completedAt: v.optional(v.number()),
			issuesTotal: v.optional(v.number()),
			issuesIndexed: v.optional(v.number()),
			documentsTotal: v.optional(v.number()),
			documentsIndexed: v.optional(v.number()),
			notesTotal: v.optional(v.number()),
			notesIndexed: v.optional(v.number()),
			commentsTotal: v.optional(v.number()),
			commentsIndexed: v.optional(v.number()),
			progressPercent: v.number(),
			error: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		// Get the project to verify access
		const project = await ctx.db.get(args.projectId);
		if (!project) return null;

		// Auth check: requires workspace membership
		await requireWorkspaceMember(ctx, project.workspaceId);

		// Get the most recent job for this project
		const jobs = await ctx.db
			.query("ragBackfillJobs")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.order("desc")
			.take(1);

		if (jobs.length === 0) return null;

		const job = jobs[0];
		const total =
			(job.issuesTotal ?? 0) +
			(job.documentsTotal ?? 0) +
			(job.notesTotal ?? 0) +
			(job.commentsTotal ?? 0);
		const done =
			(job.issuesIndexed ?? 0) +
			(job.documentsIndexed ?? 0) +
			(job.notesIndexed ?? 0) +
			(job.commentsIndexed ?? 0);
		const progressPercent = total === 0 ? 0 : Math.round((done / total) * 100);

		return {
			_id: job._id,
			status: job.status,
			startedAt: job.startedAt,
			completedAt: job.completedAt,
			issuesTotal: job.issuesTotal,
			issuesIndexed: job.issuesIndexed,
			documentsTotal: job.documentsTotal,
			documentsIndexed: job.documentsIndexed,
			notesTotal: job.notesTotal,
			notesIndexed: job.notesIndexed,
			commentsTotal: job.commentsTotal,
			commentsIndexed: job.commentsIndexed,
			progressPercent,
			error: job.error,
		};
	},
});
