"use node";

/**
 * RAG Search — Vector search wrapper for the searchProjectKnowledge tool.
 *
 * This file must be "use node" because rag.search() needs the embedding model
 * which requires process.env for Azure credentials.
 *
 * Called by the searchProjectKnowledge tool via ctx.runAction().
 */
import { v } from "convex/values";
import { internalAction } from "../_generated/server";
import {
	getCodeNamespace,
	getProjectNamespace,
	type RagSourceType,
	rag,
} from "./rag";

// ── Vector search result shape ──────────────────────────────────────────

const vVectorSearchResult = v.object({
	sourceType: v.string(),
	sourceId: v.string(),
	title: v.string(),
	snippet: v.string(),
	score: v.number(),
	metadata: v.record(v.string(), v.any()),
});

// ── Vector Search Action ────────────────────────────────────────────────

/**
 * Run RAG vector search within a project namespace.
 * Returns results with source metadata for RRF merging.
 */
export const vectorSearch = internalAction({
	args: {
		projectId: v.string(),
		query: v.string(),
		limit: v.number(),
		sourceTypeFilters: v.optional(v.array(v.string())),
		includeCode: v.boolean(),
	},
	returns: v.array(vVectorSearchResult),
	handler: async (ctx, args) => {
		const namespace = getProjectNamespace(args.projectId);

		// Build sourceType filters if specified (typed as RagSourceType)
		const filters: Array<{ name: "sourceType"; value: RagSourceType }> = [];
		if (args.sourceTypeFilters && args.sourceTypeFilters.length > 0) {
			for (const st of args.sourceTypeFilters) {
				if (st !== "github_file") {
					filters.push({
						name: "sourceType",
						value: st as RagSourceType,
					});
				}
			}
		}

		// Search content namespace
		const contentResults = await rag.search(ctx, {
			namespace,
			query: args.query,
			limit: args.limit,
			...(filters.length > 0 && { filters }),
		});

		// Map entries with scores from the parallel results array
		const results = contentResults.entries.map((entry, i) => ({
			sourceType: (entry.metadata?.sourceType as string) ?? "unknown",
			sourceId: (entry.metadata?.sourceId as string) ?? "",
			title: entry.title ?? "",
			snippet: truncateSnippet(entry.text, 200),
			score: contentResults.results[i]?.score ?? 1 / (i + 1),
			metadata: (entry.metadata as Record<string, unknown>) ?? {},
		}));

		// Also search code namespace if github_file is requested or no filter specified
		if (
			args.includeCode &&
			(!args.sourceTypeFilters ||
				args.sourceTypeFilters.length === 0 ||
				args.sourceTypeFilters.includes("github_file"))
		) {
			try {
				const codeNamespace = getCodeNamespace(args.projectId);
				const codeResults = await rag.search(ctx, {
					namespace: codeNamespace,
					query: args.query,
					limit: Math.min(args.limit, 5),
				});
				for (let i = 0; i < codeResults.entries.length; i++) {
					const entry = codeResults.entries[i];
					results.push({
						sourceType: "github_file",
						sourceId: (entry.metadata?.sourceId as string) ?? "",
						title: entry.title ?? "",
						snippet: truncateSnippet(entry.text, 200),
						score: codeResults.results[i]?.score ?? 0,
						metadata: (entry.metadata as Record<string, unknown>) ?? {},
					});
				}
			} catch {
				// Code namespace may not exist — silently skip
			}
		}

		return results;
	},
});

// ── Code Search Action ───────────────────────────────────────────────────

/** Result shape for code search — includes file path, language, line info */
const vCodeSearchResult = v.object({
	filePath: v.string(),
	language: v.string(),
	startLine: v.number(),
	endLine: v.number(),
	symbolName: v.union(v.string(), v.null()),
	snippet: v.string(),
	score: v.number(),
});

/**
 * Search the code RAG namespace for a project.
 * Returns code snippets with file path, language, and line number context.
 */
export const codeSearch = internalAction({
	args: {
		projectId: v.string(),
		query: v.string(),
		limit: v.number(),
	},
	returns: v.array(vCodeSearchResult),
	handler: async (ctx, args) => {
		const codeNamespace = getCodeNamespace(args.projectId);

		try {
			const codeResults = await rag.search(ctx, {
				namespace: codeNamespace,
				query: args.query,
				limit: args.limit,
			});

			return codeResults.entries.map((entry, i) => {
				const meta = entry.metadata as Record<string, unknown> | undefined;
				return {
					filePath: (meta?.sourceId as string) ?? "",
					language: (meta?.language as string) ?? "unknown",
					startLine: (meta?.startLine as number) ?? 1,
					endLine: (meta?.endLine as number) ?? 1,
					symbolName: (meta?.symbolName as string) ?? null,
					snippet: truncateSnippet(entry.text, 500),
					score: codeResults.results[i]?.score ?? 0,
				};
			});
		} catch {
			// Code namespace may not exist yet
			return [];
		}
	},
});

// ── Helpers ─────────────────────────────────────────────────────────────

function truncateSnippet(text: string, maxLength: number): string {
	if (!text) return "";
	if (text.length <= maxLength) return text;
	const truncated = text.slice(0, maxLength);
	const lastSpace = truncated.lastIndexOf(" ");
	if (lastSpace > maxLength * 0.6) {
		return `${truncated.slice(0, lastSpace)}...`;
	}
	return `${truncated}...`;
}
