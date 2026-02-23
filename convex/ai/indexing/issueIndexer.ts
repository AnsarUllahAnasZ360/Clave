"use node";

/**
 * Issue Indexer — RAG indexing pipeline for issues.
 *
 * When an issue is created, updated, or soft-deleted, this action is
 * scheduled via ctx.scheduler.runAfter(0, ...) from the mutation.
 * It builds a searchable text representation and delegates to the
 * syncEngine for hash comparison and embedding.
 *
 * Issues without a projectId are skipped (no project namespace).
 * Soft-deleted issues have their RAG entries and sync records removed.
 */
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { removeFromRag, syncContent } from "./syncEngine";

/**
 * Build a searchable text representation of an issue.
 * Includes title, description, and structured metadata so the agent
 * can find issues by status, priority, type, and identifier.
 */
function buildIssueContent(issue: {
	identifier: string;
	title: string;
	description?: string | null;
	status: string;
	priority: string;
	type: string;
}): string {
	const parts: string[] = [
		`${issue.identifier}: ${issue.title}`,
		"",
		issue.description ?? "",
		"",
		`Status: ${issue.status.replace(/_/g, " ")}`,
		`Priority: ${issue.priority.replace(/_/g, " ")}`,
		`Type: ${issue.type}`,
	];
	return parts.join("\n").trim();
}

/**
 * Index a single issue into the project-scoped RAG namespace.
 * Scheduled by issue create/update/remove mutations.
 */
export const indexIssue = internalAction({
	args: {
		issueId: v.id("issues"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		// Fetch the issue via internal query (queries live in queries.ts)
		const issue = await ctx.runQuery(internal.ai.indexing.queries.getIssue, {
			issueId: args.issueId,
		});

		if (!issue) {
			return null;
		}

		// If soft-deleted, remove from RAG and sync status
		if (issue.deletedAt) {
			if (issue.projectId) {
				await removeFromRag(ctx, issue.projectId, args.issueId, "issue");
			}
			return null;
		}

		// Skip issues without a project — no namespace to index into
		if (!issue.projectId) {
			return null;
		}

		// Build content and sync
		const content = buildIssueContent(issue);

		await syncContent(ctx, {
			projectId: issue.projectId,
			sourceType: "issue",
			sourceId: args.issueId,
			content,
			metadata: { title: issue.title },
		});

		return null;
	},
});
