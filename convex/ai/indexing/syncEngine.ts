"use node";

/**
 * Sync Engine — Shared incremental sync logic for RAG indexing.
 *
 * Provides reusable functions for the content indexing pipeline:
 * - `syncContent()` — hash check, delete old entry, embed new content, update sync record
 * - `removeFromRag()` — delete RAG entry and sync record for soft-deleted content
 *
 * All indexers (issue, document, comment, note) delegate to these functions
 * to avoid duplicating sync logic.
 *
 * NOTE: This is a "use node" file — only actions can be defined here.
 * Queries/mutations are in syncHelpers.ts.
 */
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import type { ActionCtx } from "../../_generated/server";
import type { RagSourceType } from "../rag";
import {
	chunkText,
	computeContentHash,
	getProjectNamespace,
	rag,
} from "../rag";

// ── Types ────────────────────────────────────────────────────────────────

interface SyncContentArgs {
	projectId: Id<"projects">;
	sourceType: RagSourceType;
	sourceId: string;
	content: string;
	/** Optional pre-computed chunks. If not provided, content is chunked automatically. */
	chunks?: string[];
	/** Metadata attached to the RAG entry (e.g., title). */
	metadata?: {
		title?: string;
	};
}

interface SyncResult {
	skipped: boolean;
	chunkCount: number;
}

// ── Sync Content ─────────────────────────────────────────────────────────

/**
 * Shared incremental sync for all content types.
 *
 * 1. Compute content hash
 * 2. Compare with existing ragSyncStatus record
 * 3. If unchanged: skip
 * 4. If changed: add/replace in RAG, clean up old entry, update sync record
 *
 * Returns whether the content was skipped and the chunk count.
 */
export async function syncContent(
	ctx: ActionCtx,
	args: SyncContentArgs,
): Promise<SyncResult> {
	const { projectId, sourceType, sourceId, content, metadata } = args;
	const namespace = getProjectNamespace(projectId);
	const key = `${sourceType}:${sourceId}`;

	// Compute hash for change detection
	const contentHash = await computeContentHash(content);

	// Check if content is unchanged
	const existingSync = await ctx.runQuery(
		internal.ai.indexing.syncHelpers.getSyncRecord,
		{ projectId, sourceType, sourceId },
	);

	if (existingSync?.contentHash === contentHash) {
		return { skipped: true, chunkCount: existingSync.chunkCount };
	}

	// Prepare chunks — use provided chunks or auto-chunk
	const chunks = args.chunks ?? chunkText(content);
	if (chunks.length === 0) {
		return { skipped: true, chunkCount: 0 };
	}

	try {
		// Add/replace in RAG. For single-chunk content, pass text directly.
		// For multi-chunk content, pass the chunks array.
		const ragArgs = {
			namespace,
			key,
			contentHash,
			filterValues: [{ name: "sourceType" as const, value: sourceType }],
			metadata: {
				sourceId,
				projectId: projectId as string,
				sourceType,
				title: metadata?.title,
			},
		};

		const { entryId, replacedEntry } =
			chunks.length === 1
				? await rag.add(ctx, { ...ragArgs, text: chunks[0] })
				: await rag.add(ctx, { ...ragArgs, chunks });

		// Clean up replaced entry
		if (replacedEntry) {
			await rag.delete(ctx, { entryId: replacedEntry.entryId });
		}

		// Update sync status
		await ctx.runMutation(internal.ai.indexing.syncHelpers.upsertSyncRecord, {
			projectId,
			sourceType,
			sourceId,
			contentHash,
			chunkCount: chunks.length,
			status: "synced",
			ragEntryId: entryId,
		});

		return { skipped: false, chunkCount: chunks.length };
	} catch (error) {
		console.error(
			`[syncEngine] Failed to sync ${sourceType} ${sourceId}:`,
			error,
		);
		await ctx.runMutation(internal.ai.indexing.syncHelpers.upsertSyncRecord, {
			projectId,
			sourceType,
			sourceId,
			contentHash,
			chunkCount: 0,
			status: "error",
			errorMessage: error instanceof Error ? error.message : "Unknown error",
		});
		return { skipped: false, chunkCount: 0 };
	}
}

// ── Remove from RAG ──────────────────────────────────────────────────────

/**
 * Remove a content entry from RAG and its sync record.
 * Used when content is soft-deleted.
 */
export async function removeFromRag(
	ctx: ActionCtx,
	projectId: Id<"projects">,
	sourceId: string,
	sourceType: RagSourceType,
): Promise<void> {
	try {
		const ragEntryId: string | null = await ctx.runMutation(
			internal.ai.indexing.syncHelpers.deleteSyncRecord,
			{ projectId, sourceType, sourceId },
		);

		if (ragEntryId) {
			// biome-ignore lint/suspicious/noExplicitAny: RAG branded EntryId type requires cast
			await rag.delete(ctx as any, { entryId: ragEntryId as any });
		}
	} catch (error) {
		console.error(
			`[syncEngine] Failed to remove ${sourceType} ${sourceId} from RAG:`,
			error,
		);
	}
}
