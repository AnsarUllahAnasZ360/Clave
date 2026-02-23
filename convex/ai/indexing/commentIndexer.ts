"use node";

/**
 * Comment Indexer — RAG indexing pipeline for issue/task/story comments.
 *
 * When a comment is created, updated, or soft-deleted, this action is
 * scheduled via ctx.scheduler.runAfter(0, ...) from the mutation.
 * It resolves the parent entity to get projectId and title, then
 * delegates to the syncEngine for hash comparison and embedding.
 *
 * Comments without a resolvable project (e.g., whiteboard-only) are skipped.
 * Soft-deleted comments have their RAG entries and sync records removed.
 */
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { removeFromRag, syncContent } from "./syncEngine";

// ── TipTap JSON → plain text ─────────────────────────────────────────────

interface TipTapNode {
	text?: string;
	content?: TipTapNode[];
}

/**
 * Extract plain text from a comment body (TipTap JSON or plain text).
 * Comments use TipTap editor format; we need plain text for embedding.
 */
function commentBodyToPlainText(body: string): string {
	if (!body.startsWith("{") && !body.startsWith("[")) {
		return body;
	}

	try {
		const doc = JSON.parse(body) as TipTapNode;
		const parts: string[] = [];

		function walk(node: TipTapNode): void {
			if (node.text !== undefined) {
				parts.push(node.text);
				return;
			}
			if (Array.isArray(node.content)) {
				for (const child of node.content) {
					walk(child);
				}
			}
		}

		walk(doc);
		return parts.join(" ").trim();
	} catch {
		return body;
	}
}

// ── Index Comment Action ─────────────────────────────────────────────────

/**
 * Index a single comment into the project-scoped RAG namespace.
 * Scheduled by comment create/update/remove mutations in comments.ts.
 */
export const indexComment = internalAction({
	args: {
		commentId: v.id("comments"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		// Fetch the comment with resolved parent info
		const comment = await ctx.runQuery(
			internal.ai.indexing.queries.getComment,
			{ commentId: args.commentId },
		);

		if (!comment) {
			return null;
		}

		// If soft-deleted, remove from RAG
		if (comment.deletedAt) {
			if (comment.projectId) {
				await removeFromRag(ctx, comment.projectId, args.commentId, "comment");
			}
			return null;
		}

		// Skip comments without a project (whiteboard-only, etc.)
		if (!comment.projectId) {
			return null;
		}

		// Build content with parent context for better search
		const bodyText = commentBodyToPlainText(comment.body);
		if (!bodyText.trim()) {
			return null;
		}

		const content = comment.parentTitle
			? `${comment.parentTitle}\n\n${bodyText}`
			: bodyText;

		await syncContent(ctx, {
			projectId: comment.projectId,
			sourceType: "comment",
			sourceId: args.commentId,
			content,
			metadata: {
				title: comment.parentTitle,
			},
		});

		return null;
	},
});
