"use node";

/**
 * Document Indexer — RAG indexing pipeline for documents.
 *
 * When a document's content is updated or a document is soft-deleted,
 * this action is scheduled via ctx.scheduler.runAfter(0, ...).
 * It converts Plate JSON to plain text, chunks by heading sections,
 * and delegates to the syncEngine for hash comparison and embedding.
 *
 * Documents without a projectId are skipped (no project namespace).
 * Soft-deleted documents have their RAG entries and sync records removed.
 */
import { v } from "convex/values";
import { internal } from "../../_generated/api";
import { internalAction } from "../../_generated/server";
import { chunkText } from "../rag";
import { removeFromRag, syncContent } from "./syncEngine";

// ── Plate JSON → plain text conversion ───────────────────────────────────

interface PlateNode {
	type?: string;
	text?: string;
	content?: PlateNode[];
	children?: PlateNode[];
}

/**
 * Convert Plate/ProseMirror JSON content to plain text.
 * Recursively walks the document AST and concatenates text nodes,
 * preserving paragraph breaks. Returns empty string for invalid input.
 */
function plateJsonToPlainText(json: string | undefined): string {
	if (!json) return "";

	let doc: PlateNode;
	try {
		doc = JSON.parse(json) as PlateNode;
	} catch {
		return json;
	}

	const parts: string[] = [];

	function walk(node: PlateNode): void {
		if (node.text !== undefined) {
			parts.push(node.text);
			return;
		}

		if (node.type === "hardBreak" || node.type === "hard_break") {
			parts.push("\n");
			return;
		}

		const children = node.children ?? node.content;
		if (Array.isArray(children)) {
			for (const child of children) {
				walk(child);
			}
		}

		if (
			node.type === "paragraph" ||
			node.type === "p" ||
			node.type === "heading" ||
			node.type === "h1" ||
			node.type === "h2" ||
			node.type === "h3" ||
			node.type === "h4" ||
			node.type === "h5" ||
			node.type === "h6" ||
			node.type === "blockquote" ||
			node.type === "code_block" ||
			node.type === "list_item" ||
			node.type === "li"
		) {
			parts.push("\n");
		}
	}

	walk(doc);

	return parts
		.join("")
		.replace(/\n{3,}/g, "\n\n")
		.trim();
}

/**
 * Index a single document into the project-scoped RAG namespace.
 * Scheduled by document updateContent/update/remove mutations.
 */
export const indexDocument = internalAction({
	args: {
		documentId: v.id("documents"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		// Fetch the document via internal query (queries live in queries.ts)
		const doc = await ctx.runQuery(internal.ai.indexing.queries.getDocument, {
			documentId: args.documentId,
		});

		if (!doc) {
			return null;
		}

		// If soft-deleted, remove from RAG and sync status
		if (doc.deletedAt) {
			if (doc.projectId) {
				await removeFromRag(ctx, doc.projectId, args.documentId, "document");
			}
			return null;
		}

		// Skip documents without a project
		if (!doc.projectId) {
			return null;
		}

		// Convert Plate JSON to plain text
		const plainText = plateJsonToPlainText(doc.content);

		// Build full content with title prefix for better search
		const fullContent = doc.title ? `${doc.title}\n\n${plainText}` : plainText;

		// Skip if no meaningful content
		if (!fullContent.trim()) {
			return null;
		}

		// Chunk the text for embedding
		const chunks = chunkText(fullContent);
		if (chunks.length === 0) {
			return null;
		}

		await syncContent(ctx, {
			projectId: doc.projectId,
			sourceType: "document",
			sourceId: args.documentId,
			content: fullContent,
			chunks,
			metadata: { title: doc.title },
		});

		return null;
	},
});
