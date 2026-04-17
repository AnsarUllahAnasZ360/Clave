"use node";

/**
 * Whiteboard Indexer — RAG indexing pipeline for whiteboards.
 *
 * Converts Excalidraw scene JSON (+ persisted whiteboardImages metadata)
 * into plain-text chunks and delegates to the syncEngine. Boards without
 * a projectId are skipped (no project namespace); soft-deleted boards are
 * removed from the index.
 *
 * Text sources, in order:
 *   1. Board title
 *   2. Shape / sticky / text-element content (via extractBoardTextItems)
 *   3. Per-image OCR text and AI captions from whiteboardImages
 */
import { v } from "convex/values";
import { api, internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { chunkText } from "../rag";
import { removeFromRag, syncContent } from "./syncEngine";
import { buildWhiteboardIndexText } from "./whiteboardIndexText";

export const indexWhiteboard = internalAction({
	args: { whiteboardId: v.id("whiteboards") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const board = await ctx.runQuery(
			internal.ai.indexing.queries.getWhiteboardForIndex,
			{ whiteboardId: args.whiteboardId },
		);
		if (!board) return null;

		if (board.deletedAt) {
			if (board.projectId) {
				await removeFromRag(
					ctx,
					board.projectId,
					args.whiteboardId,
					"whiteboard",
				);
			}
			return null;
		}

		if (!board.projectId) return null;

		// Load full scene JSON (may be in file storage for large boards).
		let sceneJson = board.sceneData ?? "[]";
		if (board.sceneDataStorageId) {
			try {
				const url = await ctx.runQuery(api.files.getUrl, {
					storageId: board.sceneDataStorageId,
				});
				if (url) {
					const res = await fetch(url);
					if (res.ok) sceneJson = await res.text();
				}
			} catch {
				// fall back to inline scene
			}
		}

		const fullContent = buildWhiteboardIndexText(
			board.title,
			sceneJson,
			board.images,
		);

		if (!fullContent) {
			// Nothing meaningful to index — remove any stale entry.
			await removeFromRag(
				ctx,
				board.projectId,
				args.whiteboardId,
				"whiteboard",
			);
			return null;
		}

		const chunks = chunkText(fullContent);
		if (chunks.length === 0) return null;

		await syncContent(ctx, {
			projectId: board.projectId,
			sourceType: "whiteboard",
			sourceId: args.whiteboardId,
			content: fullContent,
			chunks,
			metadata: { title: board.title },
		});

		return null;
	},
});
