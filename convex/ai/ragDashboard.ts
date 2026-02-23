/**
 * RAG Dashboard — Public queries for the RAG sync dashboard UI.
 *
 * Aggregates ragSyncStatus records by sourceType for per-project
 * indexing visibility. Used by the RagSyncDashboard component.
 */
import { v } from "convex/values";
import { query } from "../_generated/server";
import { requireWorkspaceMember } from "../lib/auth";

const sourceTypes = ["issue", "document", "comment", "github_file"] as const;

type SourceTypeStats = {
	synced: number;
	pending: number;
	error: number;
	lastSyncedAt: number | null;
	totalChunks: number;
};

/**
 * Get per-source-type RAG stats for a project.
 * Returns counts of synced/pending/error items and total chunks per type.
 */
export const getRagStats = query({
	args: { projectId: v.id("projects") },
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) return null;

		await requireWorkspaceMember(ctx, project.workspaceId);

		// Query all sync records for this project
		const records = await ctx.db
			.query("ragSyncStatus")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		// Initialize stats per source type
		const stats: Record<string, SourceTypeStats> = {};
		for (const type of sourceTypes) {
			stats[type] = {
				synced: 0,
				pending: 0,
				error: 0,
				lastSyncedAt: null,
				totalChunks: 0,
			};
		}

		let totalChunks = 0;

		for (const record of records) {
			const s = stats[record.sourceType];
			if (!s) continue;

			s[record.status]++;
			s.totalChunks += record.chunkCount;
			totalChunks += record.chunkCount;

			if (
				record.lastSyncedAt &&
				(s.lastSyncedAt === null || record.lastSyncedAt > s.lastSyncedAt)
			) {
				s.lastSyncedAt = record.lastSyncedAt;
			}
		}

		return {
			issue: stats.issue,
			document: stats.document,
			comment: stats.comment,
			github_file: stats.github_file,
			totalChunks,
		};
	},
});

/**
 * Get overall indexing health for a project.
 * Returns a summary used for the health badge.
 */
export const getIndexingHealth = query({
	args: { projectId: v.id("projects") },
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project) return null;

		await requireWorkspaceMember(ctx, project.workspaceId);

		const records = await ctx.db
			.query("ragSyncStatus")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		let pendingCount = 0;
		let errorCount = 0;
		let oldestPendingAt: number | null = null;

		for (const record of records) {
			if (record.status === "pending") {
				pendingCount++;
				if (oldestPendingAt === null || record.lastSyncedAt < oldestPendingAt) {
					oldestPendingAt = record.lastSyncedAt;
				}
			} else if (record.status === "error") {
				errorCount++;
			}
		}

		const isHealthy = errorCount === 0 && pendingCount === 0;

		return {
			isHealthy,
			pendingCount,
			errorCount,
			oldestPendingAt,
			totalItems: records.length,
		};
	},
});
