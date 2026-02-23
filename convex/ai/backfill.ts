"use node";

/**
 * RAG Backfill — Action for indexing all existing project content.
 *
 * Processes content in 3 phases: issues → documents → comments.
 * Each phase:
 *   1. Queries all non-deleted items for the project
 *   2. Processes them in batches of 10 via syncContent()
 *   3. Updates progress counters after each batch
 *   4. Records the phase as complete (checkpoint for resumability)
 *
 * If the action times out (10-minute Convex limit), re-running it
 * skips completed phases. syncContent() also handles hash-based dedup,
 * so individual items that were already indexed are skipped.
 *
 * NOTE: This is a "use node" file — only actions can be defined here.
 * Queries and mutations are in backfillQueries.ts.
 */
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { internalAction } from "../_generated/server";
import { syncContent } from "./indexing/syncEngine";
import { chunkText } from "./rag";

// ── Function References ─────────────────────────────────────────────────
// Use makeFunctionReference for newly created files not yet in generated types.

const listProjectIssueIdsRef = makeFunctionReference<
	"query",
	{ projectId: Id<"projects"> },
	Array<Id<"issues">>
>("ai/backfillQueries:listProjectIssueIds");

const listProjectDocumentIdsRef = makeFunctionReference<
	"query",
	{ projectId: Id<"projects"> },
	Array<Id<"documents">>
>("ai/backfillQueries:listProjectDocumentIds");

const listIssueCommentIdsRef = makeFunctionReference<
	"query",
	{ issueId: Id<"issues"> },
	Array<Id<"comments">>
>("ai/backfillQueries:listIssueCommentIds");

const getBackfillJobRef = makeFunctionReference<
	"query",
	{ jobId: Id<"ragBackfillJobs"> },
	{
		_id: Id<"ragBackfillJobs">;
		_creationTime: number;
		projectId: Id<"projects">;
		status: "running" | "completed" | "failed";
		startedAt: number;
		completedAt?: number;
		startedBy: Id<"users">;
		issuesTotal?: number;
		issuesIndexed?: number;
		documentsTotal?: number;
		documentsIndexed?: number;
		notesTotal?: number;
		notesIndexed?: number;
		commentsTotal?: number;
		commentsIndexed?: number;
		completedPhases?: string[];
		error?: string;
	} | null
>("ai/backfillQueries:getBackfillJob");

const updateBackfillProgressRef = makeFunctionReference<
	"mutation",
	{
		jobId: Id<"ragBackfillJobs">;
		issuesTotal?: number;
		issuesIndexed?: number;
		documentsTotal?: number;
		documentsIndexed?: number;
		notesTotal?: number;
		notesIndexed?: number;
		commentsTotal?: number;
		commentsIndexed?: number;
		completedPhases?: string[];
	},
	null
>("ai/backfillQueries:updateBackfillProgress");

const completeBackfillJobRef = makeFunctionReference<
	"mutation",
	{
		jobId: Id<"ragBackfillJobs">;
		status: "completed" | "failed";
		error?: string;
	},
	null
>("ai/backfillQueries:completeBackfillJob");

// ── Constants ───────────────────────────────────────────────────────────

const BATCH_SIZE = 10;
const BATCH_DELAY_MS = 100;

// ── Helpers ─────────────────────────────────────────────────────────────

/** Sleep for a given number of milliseconds. */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Process items in batches, calling a handler for each item. */
async function processBatches<T>(
	items: T[],
	handler: (item: T) => Promise<void>,
): Promise<void> {
	for (let i = 0; i < items.length; i += BATCH_SIZE) {
		const batch = items.slice(i, i + BATCH_SIZE);
		for (const item of batch) {
			await handler(item);
		}
		// Rate-limit between batches (not after the last one)
		if (i + BATCH_SIZE < items.length) {
			await sleep(BATCH_DELAY_MS);
		}
	}
}

// ── Phase Processors ────────────────────────────────────────────────────

/**
 * Process all issues for a project.
 * Delegates to syncContent which handles hash-based dedup.
 */
async function processIssues(
	ctx: ActionCtx,
	projectId: Id<"projects">,
	jobId: Id<"ragBackfillJobs">,
): Promise<void> {
	const issueIds = await ctx.runQuery(listProjectIssueIdsRef, { projectId });

	await ctx.runMutation(updateBackfillProgressRef, {
		jobId,
		issuesTotal: issueIds.length,
		issuesIndexed: 0,
	});

	let indexed = 0;
	await processBatches(issueIds, async (issueId) => {
		// Fetch issue data via internal query
		const issue = await ctx.runQuery(internal.ai.indexing.queries.getIssue, {
			issueId,
		});

		if (issue && !issue.deletedAt && issue.projectId) {
			const content = [
				`${issue.identifier}: ${issue.title}`,
				"",
				issue.description ?? "",
				"",
				`Status: ${issue.status.replace(/_/g, " ")}`,
				`Priority: ${issue.priority.replace(/_/g, " ")}`,
				`Type: ${issue.type}`,
			]
				.join("\n")
				.trim();

			await syncContent(ctx, {
				projectId: issue.projectId,
				sourceType: "issue",
				sourceId: issueId,
				content,
				metadata: { title: issue.title },
			});
		}

		indexed++;
		// Update progress every batch
		if (indexed % BATCH_SIZE === 0 || indexed === issueIds.length) {
			await ctx.runMutation(updateBackfillProgressRef, {
				jobId,
				issuesIndexed: indexed,
			});
		}
	});
}

/**
 * Process all documents for a project.
 */
async function processDocuments(
	ctx: ActionCtx,
	projectId: Id<"projects">,
	jobId: Id<"ragBackfillJobs">,
): Promise<void> {
	const docIds = await ctx.runQuery(listProjectDocumentIdsRef, { projectId });

	await ctx.runMutation(updateBackfillProgressRef, {
		jobId,
		documentsTotal: docIds.length,
		documentsIndexed: 0,
	});

	let indexed = 0;
	await processBatches(docIds, async (documentId) => {
		const doc = await ctx.runQuery(internal.ai.indexing.queries.getDocument, {
			documentId,
		});

		if (doc && !doc.deletedAt && doc.projectId) {
			const plainText = plateJsonToPlainText(doc.content);
			const fullContent = doc.title
				? `${doc.title}\n\n${plainText}`
				: plainText;

			if (fullContent.trim()) {
				const chunks = chunkText(fullContent);
				if (chunks.length > 0) {
					await syncContent(ctx, {
						projectId: doc.projectId,
						sourceType: "document",
						sourceId: documentId,
						content: fullContent,
						chunks,
						metadata: { title: doc.title },
					});
				}
			}
		}

		indexed++;
		if (indexed % BATCH_SIZE === 0 || indexed === docIds.length) {
			await ctx.runMutation(updateBackfillProgressRef, {
				jobId,
				documentsIndexed: indexed,
			});
		}
	});
}

/**
 * Process all comments for project issues.
 * Comments don't have a direct projectId, so we iterate through issues.
 */
async function processComments(
	ctx: ActionCtx,
	projectId: Id<"projects">,
	jobId: Id<"ragBackfillJobs">,
): Promise<void> {
	// Get all issue IDs for the project
	const issueIds = await ctx.runQuery(listProjectIssueIdsRef, { projectId });

	// Collect all comment IDs across all issues
	const allCommentIds: Array<Id<"comments">> = [];
	for (const issueId of issueIds) {
		const commentIds = await ctx.runQuery(listIssueCommentIdsRef, { issueId });
		allCommentIds.push(...commentIds);
	}

	await ctx.runMutation(updateBackfillProgressRef, {
		jobId,
		commentsTotal: allCommentIds.length,
		commentsIndexed: 0,
	});

	let indexed = 0;
	await processBatches(allCommentIds, async (commentId) => {
		const comment = await ctx.runQuery(
			internal.ai.indexing.queries.getComment,
			{ commentId },
		);

		if (comment && !comment.deletedAt && comment.projectId) {
			const bodyText = commentBodyToPlainText(comment.body);
			if (bodyText.trim()) {
				const content = comment.parentTitle
					? `${comment.parentTitle}\n\n${bodyText}`
					: bodyText;

				await syncContent(ctx, {
					projectId: comment.projectId,
					sourceType: "comment",
					sourceId: commentId,
					content,
					metadata: { title: comment.parentTitle },
				});
			}
		}

		indexed++;
		if (indexed % BATCH_SIZE === 0 || indexed === allCommentIds.length) {
			await ctx.runMutation(updateBackfillProgressRef, {
				jobId,
				commentsIndexed: indexed,
			});
		}
	});
}

// ── Text Conversion Helpers ─────────────────────────────────────────────

// These are duplicated from the individual indexers to avoid cross-module
// "use node" import issues. They are pure functions with no side effects.

interface PlateNode {
	type?: string;
	text?: string;
	content?: PlateNode[];
	children?: PlateNode[];
}

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

interface TipTapNode {
	text?: string;
	content?: TipTapNode[];
}

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

// ── Main Backfill Action ────────────────────────────────────────────────

/**
 * Run the backfill action for a project.
 *
 * Processes 3 content types in order: issues, documents, comments.
 * Uses phase checkpointing so the action can be resumed if it times out.
 * syncContent handles hash-based dedup so already-indexed items are skipped.
 */
export const runBackfill = internalAction({
	args: {
		projectId: v.id("projects"),
		jobId: v.id("ragBackfillJobs"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { projectId, jobId } = args;

		try {
			// Check job state for checkpoint resumability
			const job = await ctx.runQuery(getBackfillJobRef, { jobId });
			if (!job || job.status !== "running") {
				return null;
			}

			// Track completed phases locally for correct accumulation
			const donePhases = [...(job.completedPhases ?? [])];

			// Phase 1: Issues
			if (!donePhases.includes("issues")) {
				console.log(
					`[backfill] Starting issues phase for project ${projectId}`,
				);
				await processIssues(ctx, projectId, jobId);
				donePhases.push("issues");
				await ctx.runMutation(updateBackfillProgressRef, {
					jobId,
					completedPhases: [...donePhases],
				});
				console.log(`[backfill] Issues phase complete`);
			}

			// Phase 2: Documents
			if (!donePhases.includes("documents")) {
				console.log(
					`[backfill] Starting documents phase for project ${projectId}`,
				);
				await processDocuments(ctx, projectId, jobId);
				donePhases.push("documents");
				await ctx.runMutation(updateBackfillProgressRef, {
					jobId,
					completedPhases: [...donePhases],
				});
				console.log(`[backfill] Documents phase complete`);
			}

			// Phase 3: Comments
			if (!donePhases.includes("comments")) {
				console.log(
					`[backfill] Starting comments phase for project ${projectId}`,
				);
				await processComments(ctx, projectId, jobId);
				donePhases.push("comments");
				await ctx.runMutation(updateBackfillProgressRef, {
					jobId,
					completedPhases: [...donePhases],
				});
				console.log(`[backfill] Comments phase complete`);
			}

			// All phases complete
			await ctx.runMutation(completeBackfillJobRef, {
				jobId,
				status: "completed",
			});
			console.log(`[backfill] Backfill completed for project ${projectId}`);
		} catch (error) {
			console.error(
				`[backfill] Backfill failed for project ${projectId}:`,
				error,
			);
			await ctx.runMutation(completeBackfillJobRef, {
				jobId,
				status: "failed",
				error: error instanceof Error ? error.message : "Unknown error",
			});
		}

		return null;
	},
});
