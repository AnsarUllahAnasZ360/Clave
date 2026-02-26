"use node";

import { makeFunctionReference } from "convex/server";
/**
 * Docs Indexer — RAG indexing pipeline for product documentation pages.
 *
 * Unlike project-scoped indexers (issue, document, comment), docs are
 * global knowledge — not tied to any project or workspace. They live
 * in the `global:docs` namespace and use a separate `docPageSyncStatus`
 * table for sync tracking.
 *
 * The manifest in `docsManifest.ts` provides the static content to index.
 * A backfill action iterates the manifest and indexes all pages.
 */
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { internalAction } from "../../_generated/server";
import {
	chunkText,
	computeContentHash,
	GLOBAL_DOCS_NAMESPACE,
	getRag,
} from "../rag";
import { DOC_PAGES } from "./docsManifest";

// ── Internal function references ─────────────────────────────────────────
// Use makeFunctionReference to reference functions that may not be in the
// generated API yet (avoids circular dependency with codegen).

type DocSyncRecord = {
	_id: Id<"docPageSyncStatus">;
	_creationTime: number;
	slug: string;
	contentHash: string;
	lastSyncedAt: number;
	chunkCount: number;
	status: "synced" | "pending" | "error";
	errorMessage?: string;
	ragEntryId?: string;
} | null;

const getDocSyncRecordRef = makeFunctionReference<
	"query",
	{ slug: string },
	DocSyncRecord
>("ai/indexing/docsSyncHelpers:getDocSyncRecord");

const upsertDocSyncRecordRef = makeFunctionReference<
	"mutation",
	{
		slug: string;
		contentHash: string;
		chunkCount: number;
		status: "synced" | "pending" | "error";
		errorMessage?: string;
		ragEntryId?: string;
	},
	null
>("ai/indexing/docsSyncHelpers:upsertDocSyncRecord");

type IndexDocPageResult = {
	skipped: boolean;
	chunkCount: number;
};

const indexDocPageRef = makeFunctionReference<
	"action",
	{
		slug: string;
		title: string;
		section: string;
		content: string;
	},
	IndexDocPageResult
>("ai/indexing/docsIndexer:indexDocPage");

// ── Index a single doc page ──────────────────────────────────────────────

/**
 * Index a single documentation page into the global:docs RAG namespace.
 * Uses content hashing for incremental sync — skips unchanged pages.
 */
export const indexDocPage = internalAction({
	args: {
		slug: v.string(),
		title: v.string(),
		section: v.string(),
		content: v.string(),
	},
	returns: v.object({
		skipped: v.boolean(),
		chunkCount: v.number(),
	}),
	handler: async (ctx, args) => {
		const { slug, title, section, content } = args;
		const key = `doc_page:${slug}`;

		// Compute content hash for change detection
		const contentHash = await computeContentHash(content);

		// Check if content is unchanged
		const existingSync = await ctx.runQuery(getDocSyncRecordRef, { slug });

		if (existingSync?.contentHash === contentHash) {
			return { skipped: true, chunkCount: existingSync.chunkCount };
		}

		// Prefix content with title and section for better search context
		const fullContent = `${title} — ${section}\n\n${content}`;

		// Chunk the text
		const chunks = chunkText(fullContent);
		if (chunks.length === 0) {
			return { skipped: true, chunkCount: 0 };
		}

		try {
			const ragArgs = {
				namespace: GLOBAL_DOCS_NAMESPACE,
				key,
				contentHash,
				filterValues: [
					{ name: "sourceType" as const, value: "doc_page" as const },
				],
				metadata: {
					sourceId: slug,
					projectId: "global:docs",
					sourceType: "doc_page" as const,
					title,
					section,
					slug,
				},
			};

			const { entryId, replacedEntry } =
				chunks.length === 1
					? await getRag().add(ctx, { ...ragArgs, text: chunks[0] })
					: await getRag().add(ctx, { ...ragArgs, chunks });

			// Clean up replaced entry
			if (replacedEntry) {
				await getRag().delete(ctx, { entryId: replacedEntry.entryId });
			}

			// Update sync status
			await ctx.runMutation(upsertDocSyncRecordRef, {
				slug,
				contentHash,
				chunkCount: chunks.length,
				status: "synced",
				ragEntryId: entryId,
			});

			return { skipped: false, chunkCount: chunks.length };
		} catch (error) {
			console.error(`[docsIndexer] Failed to index doc page ${slug}:`, error);
			await ctx.runMutation(upsertDocSyncRecordRef, {
				slug,
				contentHash,
				chunkCount: 0,
				status: "error",
				errorMessage: error instanceof Error ? error.message : "Unknown error",
			});
			return { skipped: false, chunkCount: 0 };
		}
	},
});

// ── Backfill all docs ────────────────────────────────────────────────────

/**
 * Backfill all documentation pages from the manifest into the RAG pipeline.
 * Iterates over every page and indexes them sequentially.
 * Logs progress and returns a summary.
 */
export const backfillDocs = internalAction({
	args: {},
	returns: v.object({
		total: v.number(),
		indexed: v.number(),
		skipped: v.number(),
		errors: v.number(),
	}),
	handler: async (ctx) => {
		const total = DOC_PAGES.length;
		let indexed = 0;
		let skipped = 0;
		let errors = 0;

		console.log(`[docsIndexer] Starting backfill of ${total} doc pages...`);

		for (const page of DOC_PAGES) {
			try {
				const result = await ctx.runAction(indexDocPageRef, {
					slug: page.slug,
					title: page.title,
					section: page.section,
					content: page.content,
				});

				if (result.skipped) {
					skipped++;
				} else {
					indexed++;
					console.log(
						`[docsIndexer] Indexed: ${page.slug} (${result.chunkCount} chunks)`,
					);
				}
			} catch (error) {
				errors++;
				console.error(`[docsIndexer] Error indexing ${page.slug}:`, error);
			}
		}

		console.log(
			`[docsIndexer] Backfill complete: ${indexed} indexed, ${skipped} skipped, ${errors} errors out of ${total} total`,
		);

		return { total, indexed, skipped, errors };
	},
});
