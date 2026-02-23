/**
 * RAG Content Type Filtering for Sub-Agents
 *
 * Provides a factory function that creates a searchProjectKnowledge tool
 * variant with content type filtering baked in via closure. When a sub-agent
 * has ragContentTypes configured (e.g., ["document", "github_file"]), the
 * factory produces a tool that automatically restricts RAG results to those
 * types, reducing noise in the agent's context window.
 *
 * @see STORY-007 for design context
 * @see convex/ai/tools/read.ts for the base searchProjectKnowledge tool
 */
import { createTool } from "@convex-dev/agent";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import type { Id } from "../_generated/dataModel";
import {
	resolveWorkspaceId,
	TOOL_TIMEOUT_MS,
	withTimeout,
} from "./tools/helpers";
import type { ToolContext } from "./tools/types";

// ── Content type literals ────────────────────────────────────────────────

export const RAG_CONTENT_TYPES = [
	"issue",
	"document",
	"comment",
	"github_file",
] as const;

export type RagContentType = (typeof RAG_CONTENT_TYPES)[number];

// ── Internal function references ─────────────────────────────────────────
// Reuse the same references as read.ts to avoid duplication.

type VectorSearchResult = {
	sourceType: string;
	sourceId: string;
	title: string;
	snippet: string;
	score: number;
	metadata: Record<string, unknown>;
};

type FullTextSearchResult = {
	sourceType: string;
	sourceId: string;
	title: string;
	snippet: string;
	projectId: string | null;
};

const ragVectorSearch = makeFunctionReference<
	"action",
	{
		projectId: string;
		query: string;
		limit: number;
		sourceTypeFilters?: string[];
		includeCode: boolean;
	},
	VectorSearchResult[]
>("ai/search:vectorSearch");

const searchIssuesFullTextRef = makeFunctionReference<
	"query",
	{
		workspaceId: Id<"workspaces">;
		searchTerm: string;
		projectId?: string;
		limit: number;
	},
	FullTextSearchResult[]
>("ai/searchQueries:searchIssuesFullText");

const searchDocumentsFullTextRef = makeFunctionReference<
	"query",
	{
		workspaceId: Id<"workspaces">;
		searchTerm: string;
		projectId?: string;
		limit: number;
	},
	FullTextSearchResult[]
>("ai/searchQueries:searchDocumentsFullText");

// ── RRF merge (same algorithm as read.ts) ────────────────────────────────

interface HybridSearchResult {
	sourceType: string;
	sourceId: string;
	title: string;
	snippet: string;
	score: number;
	metadata: Record<string, unknown>;
}

const RRF_K = 60;
const MAX_RESULT_TOKENS = 4000;
const CHARS_PER_TOKEN = 4;
const MAX_RESULT_CHARS = MAX_RESULT_TOKENS * CHARS_PER_TOKEN;

function rrfMerge(
	vectorResults: Array<{
		sourceType: string;
		sourceId: string;
		title: string;
		snippet: string;
		metadata: Record<string, unknown>;
	}>,
	textResults: Array<{
		sourceType: string;
		sourceId: string;
		title: string;
		snippet: string;
	}>,
	limit: number,
): HybridSearchResult[] {
	const scores = new Map<string, number>();
	const resultMap = new Map<
		string,
		{
			sourceType: string;
			sourceId: string;
			title: string;
			snippet: string;
			metadata: Record<string, unknown>;
		}
	>();

	for (let i = 0; i < vectorResults.length; i++) {
		const r = vectorResults[i];
		const key = `${r.sourceType}:${r.sourceId}`;
		scores.set(key, (scores.get(key) ?? 0) + 1 / (RRF_K + i + 1));
		if (!resultMap.has(key)) resultMap.set(key, r);
	}

	for (let i = 0; i < textResults.length; i++) {
		const r = textResults[i];
		const key = `${r.sourceType}:${r.sourceId}`;
		scores.set(key, (scores.get(key) ?? 0) + 1 / (RRF_K + i + 1));
		if (!resultMap.has(key)) resultMap.set(key, { ...r, metadata: {} });
	}

	return [...scores.entries()]
		.sort(([, a], [, b]) => b - a)
		.slice(0, limit)
		.map(([key, score]) => {
			const result = resultMap.get(key);
			if (!result) return null;
			return { ...result, score };
		})
		.filter((r): r is HybridSearchResult => r !== null);
}

function truncateForContext(
	results: HybridSearchResult[],
): HybridSearchResult[] {
	let totalChars = 0;
	const kept: HybridSearchResult[] = [];

	for (const result of results) {
		const entryChars =
			result.title.length +
			result.snippet.length +
			result.sourceType.length +
			50;
		if (totalChars + entryChars > MAX_RESULT_CHARS && kept.length > 0) break;
		kept.push(result);
		totalChars += entryChars;
	}

	return kept;
}

// ── Shared search execution ──────────────────────────────────────────────

interface ErrorResult {
	error: string;
}

/**
 * Execute hybrid search with the given content type filter.
 * Shared logic used by both the default and filtered tool variants.
 */
async function executeSearch(
	ctx: ToolContext,
	args: {
		query: string;
		projectId?: string;
		limit: number;
	},
	contentTypeFilter: RagContentType[] | undefined,
): Promise<HybridSearchResult[] | ErrorResult> {
	const workspaceId = await resolveWorkspaceId(ctx);
	const limit = args.limit;
	const fetchLimit = 20;

	const searchIssues =
		!contentTypeFilter || contentTypeFilter.includes("issue");
	const searchDocuments =
		!contentTypeFilter || contentTypeFilter.includes("document");

	// Vector search (only when projectId is provided)
	let vectorPromise: Promise<VectorSearchResult[]> | null = null;

	if (args.projectId) {
		vectorPromise = withTimeout(
			ctx.runAction(ragVectorSearch, {
				projectId: args.projectId,
				query: args.query,
				limit: fetchLimit,
				sourceTypeFilters: contentTypeFilter,
				includeCode:
					!contentTypeFilter || contentTypeFilter.includes("github_file"),
			}),
			TOOL_TIMEOUT_MS,
			"searchProjectKnowledge:vector",
		);
	}

	// Full-text search across issues and documents
	const textPromises: Array<Promise<FullTextSearchResult[]>> = [];

	if (searchIssues) {
		textPromises.push(
			withTimeout(
				ctx.runQuery(searchIssuesFullTextRef, {
					workspaceId,
					searchTerm: args.query,
					projectId: args.projectId,
					limit: fetchLimit,
				}),
				TOOL_TIMEOUT_MS,
				"searchProjectKnowledge:issues",
			),
		);
	}

	if (searchDocuments) {
		textPromises.push(
			withTimeout(
				ctx.runQuery(searchDocumentsFullTextRef, {
					workspaceId,
					searchTerm: args.query,
					projectId: args.projectId,
					limit: fetchLimit,
				}),
				TOOL_TIMEOUT_MS,
				"searchProjectKnowledge:documents",
			),
		);
	}

	const [vectorResults, ...textResultArrays] = await Promise.all([
		vectorPromise ?? Promise.resolve([] as VectorSearchResult[]),
		...textPromises,
	]);

	const allTextResults = textResultArrays.flat();
	const mergedResults = rrfMerge(vectorResults, allTextResults, limit);
	const truncated = truncateForContext(mergedResults);

	return truncated.length === 0 ? [] : truncated;
}

// ── Factory function ─────────────────────────────────────────────────────

/**
 * Create a searchProjectKnowledge tool with content type filtering baked in.
 *
 * When `ragContentTypes` is provided, the tool restricts all search results
 * to only those content types — the agent cannot override this restriction.
 * The tool description is updated to reflect the available content types.
 *
 * When `ragContentTypes` is undefined, the tool behaves identically to the
 * default searchProjectKnowledge tool (all content types are searchable).
 *
 * @param ragContentTypes - Content types this agent is allowed to search.
 *   When undefined, all content types are available (default behavior).
 * @returns A createTool-compatible tool for inclusion in an agent's toolset.
 */
export function createFilteredRagTool(
	ragContentTypes: RagContentType[] | undefined,
) {
	const isFiltered = ragContentTypes && ragContentTypes.length > 0;

	const description = isFiltered
		? `Search the project knowledge base using semantic and keyword search. This agent's search is restricted to: ${ragContentTypes.join(", ")}. Finds relevant content even when exact keywords don't match. Requires a projectId for semantic search.`
		: "Search the project knowledge base using semantic (vector) and keyword search. Finds relevant issues, documents, comments, and code even when exact keywords don't match. Use this when the user asks questions about project content, wants to find related items, or needs context from the project knowledge base. Requires a projectId for semantic search.";

	return createTool({
		description,
		inputSchema: z.object({
			query: z.string().describe("Natural language search query"),
			projectId: z
				.string()
				.optional()
				.describe(
					"Project ID to scope the search. Required for semantic search. Without it, only keyword search runs.",
				),
			limit: z
				.number()
				.min(1)
				.max(20)
				.optional()
				.default(10)
				.describe("Maximum number of results to return (default 10)"),
		}),
		execute: async (
			ctx: ToolContext,
			args,
		): Promise<HybridSearchResult[] | ErrorResult> => {
			// Use the baked-in content type filter, ignoring any agent input
			return executeSearch(
				ctx,
				{
					query: args.query,
					projectId: args.projectId,
					limit: args.limit ?? 10,
				},
				isFiltered ? ragContentTypes : undefined,
			);
		},
	});
}
