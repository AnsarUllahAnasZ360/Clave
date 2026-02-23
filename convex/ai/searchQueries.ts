/**
 * Full-text search queries for the searchProjectKnowledge tool.
 *
 * These use Convex search indexes (workspace-scoped) and optionally
 * filter by projectId in memory for project-scoped results.
 *
 * Called by the searchProjectKnowledge tool via ctx.runQuery().
 */
import { v } from "convex/values";
import { internalQuery } from "../_generated/server";

// ── Full-text search result shape ───────────────────────────────────────

interface FullTextResult {
	sourceType: string;
	sourceId: string;
	title: string;
	snippet: string;
	projectId: string | null;
}

// ── Search Issues ───────────────────────────────────────────────────────

export const searchIssuesFullText = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		searchTerm: v.string(),
		projectId: v.optional(v.string()),
		limit: v.number(),
	},
	returns: v.array(
		v.object({
			sourceType: v.string(),
			sourceId: v.string(),
			title: v.string(),
			snippet: v.string(),
			projectId: v.union(v.string(), v.null()),
		}),
	),
	handler: async (ctx, args): Promise<FullTextResult[]> => {
		const issues = await ctx.db
			.query("issues")
			.withSearchIndex("search_title", (q) =>
				q.search("title", args.searchTerm).eq("workspaceId", args.workspaceId),
			)
			.take(args.limit);

		// Filter by projectId in memory if specified
		const filtered = args.projectId
			? issues.filter((i) => i.projectId === args.projectId)
			: issues;

		return filtered.map((issue) => ({
			sourceType: "issue",
			sourceId: issue._id,
			title: issue.title,
			snippet: buildIssueSnippet(issue),
			projectId: issue.projectId ?? null,
		}));
	},
});

// ── Search Documents ────────────────────────────────────────────────────

export const searchDocumentsFullText = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		searchTerm: v.string(),
		projectId: v.optional(v.string()),
		limit: v.number(),
	},
	returns: v.array(
		v.object({
			sourceType: v.string(),
			sourceId: v.string(),
			title: v.string(),
			snippet: v.string(),
			projectId: v.union(v.string(), v.null()),
		}),
	),
	handler: async (ctx, args): Promise<FullTextResult[]> => {
		const documents = await ctx.db
			.query("documents")
			.withSearchIndex("search_title", (q) =>
				q.search("title", args.searchTerm).eq("workspaceId", args.workspaceId),
			)
			.take(args.limit);

		const filtered = args.projectId
			? documents.filter((d) => d.projectId === args.projectId)
			: documents;

		return filtered.map((doc) => ({
			sourceType: "document",
			sourceId: doc._id,
			title: doc.title,
			snippet: `Document: ${doc.title}`,
			projectId: doc.projectId ?? null,
		}));
	},
});

// ── Helpers ─────────────────────────────────────────────────────────────

function buildIssueSnippet(issue: {
	identifier: string;
	title: string;
	status: string;
	priority: string;
	description?: string | null;
}): string {
	const parts = [`[${issue.identifier}] ${issue.title}`];
	parts.push(`Status: ${issue.status}, Priority: ${issue.priority}`);
	if (issue.description) {
		parts.push(issue.description.slice(0, 150));
	}
	return parts.join(" | ");
}
