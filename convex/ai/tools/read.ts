import { createTool } from "@convex-dev/agent";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import { api, internal } from "../../_generated/api";
import type { Doc, Id } from "../../_generated/dataModel";
import {
	BOARD_EXPORT_CHUNK_CHARS,
	chunkString,
	extractBoardTextItems,
	getSceneElementsArray,
	itemsToMarkdown,
} from "../whiteboardSceneExport";
import {
	extractEmbeddedBoardImages,
	MAX_BOARD_VISION_IMAGES,
} from "../whiteboardVision";
import {
	buildProjectNameMap,
	buildUserNameMap,
	extractPlateMedia,
	plateJsonToMarkdown,
	resolveToolUserId,
	resolveWorkspaceId,
	TOOL_TIMEOUT_MS,
	truncateAtBoundary,
	withTimeout,
} from "./helpers";

const DOCUMENT_MARKDOWN_LIMIT = 12_000;
const DOCUMENT_CHUNK_CHARS = 24_000;

type ToolContentPart =
	| { type: "text"; text: string }
	| { type: "image-data"; data: string; mediaType: string };

import type { ToolContext } from "./types";

// ── Internal function references for RAG search ─────────────────────────
// Use makeFunctionReference because these files are newly created and
// the generated `internal` types may not include them yet.

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

type CodeSearchResult = {
	filePath: string;
	language: string;
	startLine: number;
	endLine: number;
	symbolName: string | null;
	snippet: string;
	score: number;
};

const ragCodeSearch = makeFunctionReference<
	"action",
	{
		projectId: string;
		query: string;
		limit: number;
	},
	CodeSearchResult[]
>("ai/search:codeSearch");

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

// ── Return type interfaces ───────────────────────────────────────────────

interface IssueResult {
	id: string;
	identifier: string;
	title: string;
	status: string;
	priority: string;
	type: string;
	assigneeId: string | null;
	assigneeName: string | null;
	projectId: string | null;
	projectName: string | null;
}

interface ProjectListResult {
	id: string;
	name: string;
	slug: string;
	status: string;
	priority: string | null;
	leadName: string | null;
	startDate: number | null;
	endDate: number | null;
	issueStats: {
		backlog: number;
		todo: number;
		in_progress: number;
		done: number;
		total: number;
	} | null;
}

interface MilestoneResult {
	id: string;
	name: string;
	status: string;
	targetDate: number | null;
}

interface ProjectDetailResult {
	id: string;
	name: string;
	slug: string;
	status: string;
	priority: string | null;
	description: string | null;
	summary: string | null;
	icon: string | null;
	color: string | null;
	leadId: string | null;
	leadName: string | null;
	clientId: string | null;
	startDate: number | null;
	endDate: number | null;
	tags: string[];
	issueStats: {
		backlog: number;
		todo: number;
		in_progress: number;
		done: number;
		total: number;
	} | null;
	milestones: MilestoneResult[];
}

interface IssueParent {
	id: string;
	identifier: string;
	title: string;
	status: string;
}

interface IssueDetailResult {
	id: string;
	identifier: string;
	title: string;
	description: string | null;
	status: string;
	priority: string;
	type: string;
	assigneeId: string | null;
	assigneeName: string | null;
	projectId: string | null;
	projectName: string | null;
	sprintId: string | null;
	labelIds: string[];
	labelNames: string[];
	startDate: number | null;
	dueDate: number | null;
	estimate: number | null;
	tags: string[];
	createdBy: string;
	completedAt: number | null;
	parent: IssueParent | null;
	subIssueCount: number;
	commentCount: number;
}

interface DocumentResult {
	id: string;
	title: string;
	content: string;
	format: "markdown";
	truncated: boolean;
	totalLength: number;
	wordCount: number;
	projectId: string | null;
	projectName: string | null;
	icon: string | null;
	visibility: string;
	createdBy: string;
	lastEditedBy: string | null;
	createdAt: number;
	updatedAt: number | null;
	images: Array<{ url: string; alt: string }>;
	tables: Array<{ rows: number; cols: number }>;
}

interface DocumentSearchItem {
	id: string;
	title: string;
	projectId: string | null;
	projectName: string | null;
	visibility: string;
	updatedAt: number | null;
}

interface NotificationItem {
	id: string;
	type: string;
	title: string;
	body: string | null;
	isRead: boolean;
	actorName: string | null;
	entityType: string | null;
	entityTitle: string | null;
	createdAt: number;
}

interface NotificationResult {
	notifications: NotificationItem[];
	unreadCount: number;
}

interface GlobalSearchItem {
	type: string;
	id: string;
	title: string;
	status?: string;
	identifier?: string;
}

interface GlobalSearchResult {
	results: GlobalSearchItem[];
	totalCount: number;
}

interface MemberResult {
	userId: string;
	name: string | null;
	email: string | null;
	role: string;
	joinedAt: number;
}

interface LabelResult {
	id: string;
	name: string;
	color: string;
	description: string | null;
}

interface SprintResult {
	id: string;
	name: string;
	status: string;
	projectId: string;
	projectName: string;
	startDate: number | null;
	targetDate: number | null;
	issueCount: number;
	completedCount: number;
	progressPercentage: number;
}

interface ActivityLogEntry {
	action: string;
	actorName: string;
	description: string | null;
	timestamp: number;
	field: string | null;
	oldValue: string | null;
	newValue: string | null;
}

interface ActivityResult {
	logs: ActivityLogEntry[];
	total: number;
}

interface ErrorResult {
	error: string;
}

// ── 1. searchIssues ──────────────────────────────────────────────────────

export const searchIssues = createTool({
	description:
		"Search issues in the workspace. Supports text search and/or filtering by status, priority, assignee, and project. Use this when the user asks about issues, bugs, tasks, or wants to find specific work items.",
	inputSchema: z.object({
		query: z
			.string()
			.optional()
			.describe(
				"Search term to find issues by title. Leave empty to list all matching filters.",
			),
		status: z
			.enum([
				"triage",
				"backlog",
				"todo",
				"in_progress",
				"in_review",
				"done",
				"cancelled",
			])
			.optional()
			.describe("Filter by status"),
		priority: z
			.enum(["urgent", "high", "medium", "low", "no_priority"])
			.optional()
			.describe("Filter by priority"),
		assigneeId: z.string().optional().describe("Filter by assignee user ID"),
		projectId: z.string().optional().describe("Filter by project ID"),
		limit: z
			.number()
			.optional()
			.default(20)
			.describe("Max results to return (default 20)"),
	}),
	execute: async (ctx: ToolContext, args): Promise<IssueResult[]> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);
		const hasFilters = !!(
			args.status ||
			args.priority ||
			args.assigneeId?.trim() ||
			args.projectId?.trim()
		);

		// Build name lookup maps for human-readable output
		const [userNames, projectNames] = await Promise.all([
			buildUserNameMap(ctx, workspaceId),
			buildProjectNameMap(ctx, workspaceId),
		]);

		const mapIssue = (issue: {
			_id: string;
			identifier: string;
			title: string;
			status: string;
			priority: string;
			type: string;
			assigneeId?: string;
			projectId?: string;
		}): IssueResult => ({
			id: issue._id,
			identifier: issue.identifier,
			title: issue.title,
			status: issue.status,
			priority: issue.priority,
			type: issue.type,
			assigneeId: issue.assigneeId ?? null,
			assigneeName: issue.assigneeId
				? (userNames.get(issue.assigneeId) ?? null)
				: null,
			projectId: issue.projectId ?? null,
			projectName: issue.projectId
				? (projectNames.get(issue.projectId) ?? null)
				: null,
		});

		// Use full-text search when a query is provided
		if (args.query?.trim()) {
			const results = await withTimeout(
				ctx.runQuery(internal.ai.toolQueries.searchIssues, {
					workspaceId,
					searchTerm: args.query,
					userId,
				}),
				TOOL_TIMEOUT_MS,
				"searchIssues",
			);

			// Apply filters to full-text search results
			const filtered = hasFilters
				? results.filter(
						(issue: {
							status?: string;
							priority?: string;
							assigneeId?: string | null;
							projectId?: string | null;
						}) => {
							if (args.status && issue.status !== args.status) return false;
							if (args.priority && issue.priority !== args.priority)
								return false;
							if (
								args.assigneeId?.trim() &&
								issue.assigneeId !== args.assigneeId
							)
								return false;
							if (args.projectId?.trim() && issue.projectId !== args.projectId)
								return false;
							return true;
						},
					)
				: results;

			return filtered.slice(0, args.limit).map(mapIssue);
		}

		// Use filtered list query when no text search is needed
		const result = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.listIssues, {
				workspaceId,
				userId,
				status: args.status,
				priority: args.priority,
				assigneeId: args.assigneeId || undefined,
				projectId: args.projectId || undefined,
				limit: args.limit,
			}),
			TOOL_TIMEOUT_MS,
			"listIssues",
		);

		return result.issues.map(mapIssue);
	},
});

// ── 2. listProjects ──────────────────────────────────────────────────────

export const listProjects = createTool({
	description:
		"List all accessible projects in the workspace with issue progress stats. RBAC-filtered: member-role users only see their accessible projects. Use this when the user asks about projects, wants to see what projects exist, or needs project IDs for further queries.",
	inputSchema: z.object({
		activeOnly: z
			.boolean()
			.optional()
			.describe("If true, only return active projects"),
	}),
	execute: async (ctx: ToolContext, args): Promise<ProjectListResult[]> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const projects = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.listProjects, {
				workspaceId,
				userId,
			}),
			TOOL_TIMEOUT_MS,
			"listProjects",
		);

		const filtered = args.activeOnly
			? projects.filter((p: { status?: string }) => p.status === "active")
			: projects;

		// Resolve lead names
		const userNames = await buildUserNameMap(ctx, workspaceId);

		// Fetch stats for each project in parallel
		const statsResults = await Promise.all(
			filtered.map((p: { _id: Id<"projects"> }) =>
				ctx.runQuery(internal.ai.toolQueries.getProjectStats, {
					projectId: p._id,
				}),
			),
		);

		return filtered.map(
			(
				project: {
					_id: string;
					name: string;
					slug: string;
					status: string;
					priority?: string;
					leadId?: string;
					startDate?: number;
					endDate?: number;
				},
				i: number,
			) => ({
				id: project._id,
				name: project.name,
				slug: project.slug,
				status: project.status,
				priority: project.priority ?? null,
				leadName: project.leadId
					? (userNames.get(project.leadId) ?? null)
					: null,
				startDate: project.startDate ?? null,
				endDate: project.endDate ?? null,
				issueStats: statsResults[i] ?? null,
			}),
		);
	},
});

// ── 3. getIssueDetails ───────────────────────────────────────────────────

export const getIssueDetails = createTool({
	description:
		'Get full details of a specific issue by its identifier (e.g., "CLV-042") or by its ID. Includes assignee name, project name, label names, sub-issue count, and comment count. Use this when the user asks for details about a specific issue.',
	inputSchema: z.object({
		identifier: z
			.string()
			.optional()
			.describe('Issue identifier like "CLV-042"'),
		issueId: z.string().optional().describe("Issue ID (Convex document ID)"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<IssueDetailResult | ErrorResult> => {
		if (!args.identifier && !args.issueId) {
			return { error: "Provide either an identifier or issueId." };
		}

		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		// Fetch issue by identifier or ID — queries return enriched issue docs with parent
		let issue:
			| (Doc<"issues"> & {
					parent: {
						_id: Id<"issues">;
						identifier: string;
						title: string;
						status: string;
					} | null;
			  })
			| null;

		if (args.identifier) {
			issue = await ctx.runQuery(internal.ai.toolQueries.getIssueByIdentifier, {
				workspaceId,
				identifier: args.identifier,
				userId,
			});
		} else {
			issue = await ctx.runQuery(internal.ai.toolQueries.getIssueById, {
				issueId: args.issueId as Id<"issues">,
				userId,
			});
			// Verify issue belongs to the resolved workspace
			if (issue && issue.workspaceId !== workspaceId) {
				issue = null;
			}
		}

		if (!issue) {
			return { error: "Issue not found." };
		}

		// Resolve names and counts in parallel
		const [userNames, projectNames, labels, subIssues, comments] =
			await Promise.all([
				buildUserNameMap(ctx, workspaceId),
				buildProjectNameMap(ctx, workspaceId),
				ctx.runQuery(internal.ai.toolQueries.listLabels, {
					workspaceId,
				}),
				ctx.runQuery(internal.ai.toolQueries.getSubIssues, {
					parentId: issue._id,
					userId,
				}),
				ctx.runQuery(internal.ai.toolQueries.listCommentsByIssue, {
					issueId: issue._id,
				}),
			]);

		// Build label name lookup
		const labelNameMap = new Map<string, string>();
		for (const label of labels) {
			labelNameMap.set(label._id, label.name);
		}
		const issueLabels = issue.labelIds ?? [];
		const labelNames = issueLabels
			.map((id: string) => labelNameMap.get(id))
			.filter((n: string | undefined): n is string => !!n);

		return {
			id: issue._id,
			identifier: issue.identifier,
			title: issue.title,
			description: issue.description ?? null,
			status: issue.status,
			priority: issue.priority,
			type: issue.type,
			assigneeId: issue.assigneeId ?? null,
			assigneeName: issue.assigneeId
				? (userNames.get(issue.assigneeId) ?? null)
				: null,
			projectId: issue.projectId ?? null,
			projectName: issue.projectId
				? (projectNames.get(issue.projectId) ?? null)
				: null,
			sprintId: issue.sprintId ?? null,
			labelIds: issueLabels.map(String),
			labelNames,
			startDate: issue.startDate ?? null,
			dueDate: issue.dueDate ?? null,
			estimate: issue.estimate ?? null,
			tags: issue.tags ?? [],
			createdBy: issue.createdBy,
			completedAt: issue.completedAt ?? null,
			parent: issue.parent
				? {
						id: issue.parent._id,
						identifier: issue.parent.identifier,
						title: issue.parent.title,
						status: issue.parent.status,
					}
				: null,
			subIssueCount: subIssues ? subIssues.stats.total : 0,
			commentCount: comments.length,
		};
	},
});

// ── 4. getDocument ───────────────────────────────────────────────────────

export const getDocument = createTool({
	description:
		"Get a document by its ID, returning its title and full content rendered as Markdown. Preserves headings, lists, tables, code blocks, links, and images (as ![alt](url)) so you can reference them when creating issues, sprints, or project descriptions. Also returns a separate `images` array (URL + alt text) and `tables` summary so nothing is lost even when content is truncated. If `truncated` is true, use `readDocumentChunked` to read the full content in paginated chunks. When drafting descriptions for issues/sprints/projects from a document, quote headings and table rows directly and embed the original image URLs using Markdown image syntax so they render in-place.",
	inputSchema: z.object({
		documentId: z.string().describe("The document ID to retrieve"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<DocumentResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const [document, userNames, projectNames] = await Promise.all([
			ctx.runQuery(internal.ai.toolQueries.getDocumentById, {
				documentId: args.documentId as Id<"documents">,
			}),
			buildUserNameMap(ctx, workspaceId),
			buildProjectNameMap(ctx, workspaceId),
		]);

		if (!document) {
			return { error: "Document not found." };
		}

		if (document.workspaceId !== workspaceId) {
			return { error: "Document not found." };
		}

		// Resolve content: try the documents table first, then fall back
		// to reconstructing from Yjs v3 snapshots (real-time collab storage).
		let rawContent = document.content;
		if (!rawContent || plateJsonToMarkdown(rawContent).trim() === "") {
			try {
				const yjsContent = await ctx.runQuery(
					internal.yjsV3.getDocumentContentFromYjs,
					{ documentId: args.documentId as Id<"documents"> },
				);
				if (yjsContent) {
					rawContent = yjsContent;
				}
			} catch {
				// Yjs extraction failed — proceed with whatever we have
			}
		}

		const markdown = plateJsonToMarkdown(rawContent);
		const truncated = markdown.length > DOCUMENT_MARKDOWN_LIMIT;
		const content = truncated
			? truncateAtBoundary(markdown, DOCUMENT_MARKDOWN_LIMIT)
			: markdown;
		const media = extractPlateMedia(rawContent);
		const wordCount = markdown.split(/\s+/).filter((w) => w.length > 0).length;

		return {
			id: document._id,
			title: document.title,
			content,
			format: "markdown",
			truncated,
			totalLength: markdown.length,
			wordCount,
			projectId: document.projectId ?? null,
			projectName: document.projectId
				? (projectNames.get(document.projectId) ?? null)
				: null,
			icon: document.icon ?? null,
			visibility: document.visibility ?? "private",
			createdBy: userNames.get(document.createdBy) ?? "Unknown",
			lastEditedBy: document.lastEditedBy
				? (userNames.get(document.lastEditedBy) ?? null)
				: null,
			createdAt: document._creationTime,
			updatedAt: document.updatedAt ?? null,
			images: media.images,
			tables: media.tables,
		};
	},
});

// ── 5. searchDocuments ────────────────────────────────────────────────────

export const searchDocuments = createTool({
	description:
		"Search documents in the workspace by title. Optionally filter by project. Use this when the user asks about documents, specs, or wants to find a specific document.",
	inputSchema: z.object({
		query: z
			.string()
			.optional()
			.describe(
				"Search term to find documents by title. Leave empty to list all.",
			),
		projectId: z.string().optional().describe("Filter by project ID"),
		limit: z
			.number()
			.optional()
			.default(20)
			.describe("Max results to return (default 20)"),
	}),
	execute: async (ctx: ToolContext, args): Promise<DocumentSearchItem[]> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const [documents, projectNames] = await Promise.all([
			withTimeout(
				ctx.runQuery(internal.ai.toolQueries.listDocuments, {
					workspaceId,
					userId,
				}),
				TOOL_TIMEOUT_MS,
				"searchDocuments",
			),
			buildProjectNameMap(ctx, workspaceId),
		]);

		let filtered = documents;

		// Filter by project if specified
		if (args.projectId) {
			filtered = filtered.filter(
				(d: { projectId?: string | null }) => d.projectId === args.projectId,
			);
		}

		// Filter by query text (case-insensitive title match)
		if (args.query?.trim()) {
			const queryLower = args.query.toLowerCase();
			filtered = filtered.filter((d: { title: string }) =>
				d.title.toLowerCase().includes(queryLower),
			);
		}

		return filtered
			.slice(0, args.limit)
			.map(
				(doc: {
					_id: string;
					title: string;
					projectId?: string;
					visibility?: string;
					updatedAt?: number;
				}) => ({
					id: doc._id,
					title: doc.title,
					projectId: doc.projectId ?? null,
					projectName: doc.projectId
						? (projectNames.get(doc.projectId) ?? null)
						: null,
					visibility: doc.visibility ?? "private",
					updatedAt: doc.updatedAt ?? null,
				}),
			);
	},
});

// ── 5b. readDocumentChunked ──────────────────────────────────────────────

interface DocumentChunkResult {
	documentId: string;
	title: string;
	projectId: string | null;
	totalLength: number;
	totalChunks: number;
	chunkIndex: number;
	content: string;
	format: "markdown";
}

export const readDocumentChunked = createTool({
	description:
		"Read a large document in paginated chunks. Use when getDocument returns truncated: true. Call with chunkIndex 0 first; if totalChunks > 1, call again with chunkIndex 1, 2, ... until you have read every chunk. Each chunk is up to 24,000 characters of Markdown. Useful for long specs, PRDs, or meeting notes that exceed the single-call limit.",
	inputSchema: z.object({
		documentId: z
			.string()
			.describe("Document ID (from getDocument or searchDocuments)"),
		chunkIndex: z
			.number()
			.optional()
			.default(0)
			.describe("Zero-based chunk index (default 0)"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<DocumentChunkResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const document = await ctx.runQuery(
			internal.ai.toolQueries.getDocumentById,
			{ documentId: args.documentId as Id<"documents"> },
		);

		if (!document) {
			return { error: "Document not found." };
		}
		if (document.workspaceId !== workspaceId) {
			return { error: "Document not found." };
		}

		const markdown = plateJsonToMarkdown(document.content);
		const chunks =
			markdown.length === 0
				? [""]
				: chunkString(markdown, DOCUMENT_CHUNK_CHARS);
		const totalChunks = Math.max(1, chunks.length);
		const safeIndex = Math.min(
			Math.max(0, args.chunkIndex ?? 0),
			totalChunks - 1,
		);

		return {
			documentId: document._id,
			title: document.title,
			projectId: document.projectId ?? null,
			totalLength: markdown.length,
			totalChunks,
			chunkIndex: safeIndex,
			content: chunks[safeIndex] ?? "",
			format: "markdown",
		};
	},
});

// ── 5c. readDocumentWithVision ───────────────────────────────────────────

const MAX_DOC_VISION_IMAGES = 8;
const MAX_DOC_IMAGE_BYTES = 4_500_000; // ~4.5 MB limit per image

export interface ReadDocumentWithVisionResult {
	documentId: string;
	title: string;
	projectId: string | null;
	wordCount: number;
	totalLength: number;
	totalChunks: number;
	chunkIndex: number;
	content: string;
	format: "markdown";
	imageCount: number;
	images: Array<{ dataUrl: string; mediaType: string; alt: string }>;
	tables: Array<{ rows: number; cols: number }>;
}

/**
 * Build multipart vision output for readDocumentWithVision — matches
 * the board vision builder pattern for consistency.
 */
export function buildReadDocumentWithVisionOutput(
	output: ReadDocumentWithVisionResult | ErrorResult,
):
	| { type: "error-text"; value: string }
	| { type: "content"; value: ToolContentPart[] } {
	if (output && typeof output === "object" && "error" in output) {
		return { type: "error-text", value: String(output.error) };
	}
	const result = output as ReadDocumentWithVisionResult;
	const header = [
		`# Document "${result.title}"`,
		`Document ID: ${result.documentId}`,
		`Words: ${result.wordCount}, length: ${result.totalLength} chars`,
		`Chunk ${result.chunkIndex + 1}/${result.totalChunks}`,
		result.imageCount > 0
			? `${result.imageCount} image(s) attached below — inspect them visually for diagrams, flowcharts, screenshots, and tables.`
			: "No images in this document.",
		result.tables.length > 0
			? `${result.tables.length} table(s) included in the markdown below.`
			: null,
		"",
		result.content || "(empty document)",
	]
		.filter((l) => l !== null)
		.join("\n");

	const parts: ToolContentPart[] = [{ type: "text", text: header }];

	for (const img of result.images) {
		const comma = img.dataUrl.indexOf(",");
		const data = comma >= 0 ? img.dataUrl.slice(comma + 1) : img.dataUrl;
		parts.push({ type: "image-data", data, mediaType: img.mediaType });
	}

	return { type: "content", value: parts };
}

export const readDocumentWithVision = createTool({
	description:
		"Read a document AND see its embedded images (diagrams, flowcharts, screenshots, tables-as-images). Returns Markdown text plus vision attachments so the model can visually inspect images. Use this when the user asks the agent to understand diagrams, flowcharts, or visual content embedded in a document, or when creating issues/sprints from a document that contains visual specs. Images are only attached on chunkIndex 0 to avoid duplication. Tables in the document text are rendered as Markdown tables in the content field.",
	inputSchema: z.object({
		documentId: z.string().describe("Document ID to read with vision"),
		chunkIndex: z
			.number()
			.optional()
			.default(0)
			.describe("Zero-based chunk index for large documents (default 0)"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<ReadDocumentWithVisionResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const document = await ctx.runQuery(
			internal.ai.toolQueries.getDocumentById,
			{ documentId: args.documentId as Id<"documents"> },
		);

		if (!document) return { error: "Document not found." };
		if (document.workspaceId !== workspaceId) {
			return { error: "Document not found." };
		}

		const markdown = plateJsonToMarkdown(document.content);
		const chunks =
			markdown.length === 0
				? [""]
				: chunkString(markdown, DOCUMENT_CHUNK_CHARS);
		const totalChunks = Math.max(1, chunks.length);
		const chunkIndex = Math.min(
			Math.max(0, args.chunkIndex ?? 0),
			totalChunks - 1,
		);
		const content = chunks[chunkIndex] ?? "";
		const media = extractPlateMedia(document.content);
		const wordCount = markdown.split(/\s+/).filter((w) => w.length > 0).length;

		// Fetch actual image data for vision — only on first chunk
		const visionImages: Array<{
			dataUrl: string;
			mediaType: string;
			alt: string;
		}> = [];

		if (chunkIndex === 0 && media.images.length > 0) {
			const imagesToFetch = media.images.slice(0, MAX_DOC_VISION_IMAGES);
			const settled = await Promise.allSettled(
				imagesToFetch.map(async (img) => {
					try {
						const res = await fetch(img.url);
						if (!res.ok) return null;
						const ct = res.headers.get("content-type") ?? "image/png";
						const buf = await res.arrayBuffer();
						if (buf.byteLength > MAX_DOC_IMAGE_BYTES) return null;
						const base64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
						const mediaType = ct.startsWith("image/")
							? ct.split(";")[0]
							: "image/png";
						return {
							dataUrl: `data:${mediaType};base64,${base64}`,
							mediaType,
							alt: img.alt,
						};
					} catch {
						return null;
					}
				}),
			);

			for (const result of settled) {
				if (result.status === "fulfilled" && result.value) {
					visionImages.push(result.value);
				}
			}
		}

		return {
			documentId: document._id,
			title: document.title,
			projectId: document.projectId ?? null,
			wordCount,
			totalLength: markdown.length,
			totalChunks,
			chunkIndex,
			content,
			format: "markdown",
			imageCount: visionImages.length,
			images: visionImages,
			tables: media.tables,
		};
	},
	toModelOutput: (_ctx, { output }) =>
		buildReadDocumentWithVisionOutput(
			output as ReadDocumentWithVisionResult | ErrorResult,
		),
});

// ── 6. globalSearch ──────────────────────────────────────────────────────

export const globalSearch = createTool({
	description:
		"Search across all entity types in the workspace: issues, projects, documents, whiteboards, clients, stories, and tasks. Best for broad queries that span multiple categories (e.g. 'find everything about authentication'). Returns lightweight summaries — use specific tools like getIssueDetails or getDocument for full content.",
	inputSchema: z.object({
		query: z.string().describe("The search term"),
	}),
	execute: async (ctx: ToolContext, args): Promise<GlobalSearchResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const results = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.globalSearch, {
				workspaceId,
				searchTerm: args.query,
				userId,
			}),
			TOOL_TIMEOUT_MS,
			"globalSearch",
		);

		// Flatten results into a unified list with entity type labels
		const items: GlobalSearchItem[] = [];

		for (const project of results.projects) {
			items.push({
				type: "project",
				id: project._id,
				title: project.name,
				status: project.status,
			});
		}
		for (const issue of results.issues) {
			items.push({
				type: "issue",
				id: issue._id,
				title: issue.title,
				status: issue.status,
				identifier: issue.identifier,
			});
		}
		for (const doc of results.documents) {
			items.push({
				type: "document",
				id: doc._id,
				title: doc.title,
			});
		}
		for (const wb of results.whiteboards) {
			items.push({
				type: "whiteboard",
				id: wb._id,
				title: wb.title,
			});
		}
		for (const client of results.clients) {
			items.push({
				type: "client",
				id: client._id,
				title: client.name,
				status: client.status,
			});
		}
		for (const story of results.stories) {
			items.push({
				type: "story",
				id: story._id,
				title: story.title,
				status: story.status,
				identifier: story.identifier,
			});
		}
		for (const task of results.tasks) {
			items.push({
				type: "task",
				id: task._id,
				title: task.title,
				status: task.status,
				identifier: task.identifier,
			});
		}

		return { results: items, totalCount: items.length };
	},
});

// ── 6. listWorkspaceMembers ──────────────────────────────────────────────

export const listWorkspaceMembers = createTool({
	description:
		"List all members in the workspace with their name, email, and role. Use this when the user asks about team members, who is on the team, or needs a user ID for assigning issues.",
	inputSchema: z.object({}),
	execute: async (ctx: ToolContext): Promise<MemberResult[]> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		const members = await ctx.runQuery(internal.ai.toolQueries.listMembers, {
			workspaceId,
		});

		return members.map(
			(member: {
				userId: string;
				user?: { name?: string; email?: string } | null;
				role: string;
				joinedAt: number;
			}) => ({
				userId: member.userId,
				name: member.user?.name ?? null,
				email: member.user?.email ?? null,
				role: member.role,
				joinedAt: member.joinedAt,
			}),
		);
	},
});

// ── 7. getProjectDetails ─────────────────────────────────────────────────

export const getProjectDetails = createTool({
	description:
		"Get full details of a specific project by its ID or slug. Includes issue progress stats, recent milestones, and lead name. Use this when the user asks for details about a specific project.",
	inputSchema: z.object({
		projectId: z.string().optional().describe("The project ID to retrieve"),
		slug: z
			.string()
			.optional()
			.describe("The project slug to retrieve (alternative to projectId)"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<ProjectDetailResult | ErrorResult> => {
		if (!args.projectId && !args.slug) {
			return { error: "Provide either a projectId or slug." };
		}

		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		// Lookup by ID or slug — queries return full project documents
		let project: Doc<"projects"> | null;

		if (args.slug) {
			project = await ctx.runQuery(internal.ai.toolQueries.getProjectBySlug, {
				workspaceId,
				slug: args.slug,
				userId,
			});
		} else {
			project = await ctx.runQuery(internal.ai.toolQueries.getProjectById, {
				projectId: args.projectId as Id<"projects">,
				userId,
			});
			// Verify project belongs to the resolved workspace
			if (project && project.workspaceId !== workspaceId) {
				project = null;
			}
		}

		if (!project) {
			return { error: "Project not found." };
		}

		// Fetch stats, milestones, and user names in parallel
		const [stats, milestones, userNames] = await Promise.all([
			ctx.runQuery(internal.ai.toolQueries.getProjectStats, {
				projectId: project._id,
			}),
			ctx.runQuery(internal.ai.toolQueries.listMilestones, {
				projectId: project._id,
			}),
			buildUserNameMap(ctx, workspaceId),
		]);

		return {
			id: project._id,
			name: project.name,
			slug: project.slug,
			status: project.status,
			priority: project.priority ?? null,
			description: project.description ?? null,
			summary: project.summary ?? null,
			icon: project.icon ?? null,
			color: project.color ?? null,
			leadId: project.leadId ?? null,
			leadName: project.leadId ? (userNames.get(project.leadId) ?? null) : null,
			clientId: project.clientId ?? null,
			startDate: project.startDate ?? null,
			endDate: project.endDate ?? null,
			tags: project.tags ?? [],
			issueStats: stats ?? null,
			milestones: milestones.map(
				(m: {
					_id: string;
					name: string;
					status: string;
					targetDate?: number;
				}) => ({
					id: m._id,
					name: m.name,
					status: m.status,
					targetDate: m.targetDate ?? null,
				}),
			),
		};
	},
});

// ── 8. listLabels ────────────────────────────────────────────────────────

export const listLabels = createTool({
	description:
		"List all labels in the workspace. Use this when the user asks about labels, wants to know what labels exist, or needs label IDs for creating/updating issues.",
	inputSchema: z.object({}),
	execute: async (ctx: ToolContext): Promise<LabelResult[]> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		const labels = await ctx.runQuery(internal.ai.toolQueries.listLabels, {
			workspaceId,
		});

		return labels.map(
			(label: {
				_id: string;
				name: string;
				color: string;
				description?: string;
			}) => ({
				id: label._id,
				name: label.name,
				color: label.color,
				description: label.description ?? null,
			}),
		);
	},
});

// ── 9. listSprints ───────────────────────────────────────────────────────

export const listSprints = createTool({
	description:
		"List all sprints across all projects in the workspace. Returns sprint name, status, dates, project name, and progress. Use this when the user asks about sprints, current iterations, or sprint progress. Optionally filter by projectId when planning work for one project.",
	inputSchema: z.object({
		status: z
			.enum(["planned", "active", "completed", "cancelled"])
			.optional()
			.describe("Filter by sprint status"),
		projectId: z
			.string()
			.optional()
			.describe("Only sprints belonging to this project ID"),
	}),
	execute: async (ctx: ToolContext, args): Promise<SprintResult[]> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const sprints = await ctx.runQuery(internal.ai.toolQueries.listSprints, {
			workspaceId,
			userId,
		});

		let filtered = args.status
			? sprints.filter((s: { status?: string }) => s.status === args.status)
			: sprints;

		if (args.projectId) {
			filtered = filtered.filter(
				(s: { projectId?: string }) => s.projectId === args.projectId,
			);
		}

		return filtered.map(
			(sprint: {
				_id: string;
				projectId: string;
				name: string;
				status: string;
				projectName: string;
				startDate?: number;
				targetDate?: number;
				issueCount: number;
				completedCount: number;
				progressPercentage: number;
			}) => ({
				id: sprint._id,
				name: sprint.name,
				status: sprint.status,
				projectId: sprint.projectId,
				projectName: sprint.projectName,
				startDate: sprint.startDate ?? null,
				targetDate: sprint.targetDate ?? null,
				issueCount: sprint.issueCount,
				completedCount: sprint.completedCount,
				progressPercentage: sprint.progressPercentage,
			}),
		);
	},
});

// ── 10. getActivity ──────────────────────────────────────────────────────

export const getActivity = createTool({
	description:
		"Get the activity log for a specific issue or project. Shows recent actions like status changes, assignments, comments, and other updates. Use this when the user asks about recent activity or changes on an issue or project.",
	inputSchema: z.object({
		entityType: z
			.enum(["issue", "project"])
			.describe('The type of entity to get activity for: "issue" or "project"'),
		entityId: z
			.string()
			.describe("The ID of the issue or project to get activity for"),
		limit: z
			.number()
			.optional()
			.default(20)
			.describe("Max activity entries to return (default 20)"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<ActivityResult | ErrorResult> => {
		await resolveWorkspaceId(ctx);

		if (args.entityType === "issue") {
			const result = await withTimeout(
				ctx.runQuery(internal.ai.toolQueries.listActivityByIssue, {
					issueId: args.entityId as Id<"issues">,
					limit: args.limit,
				}),
				TOOL_TIMEOUT_MS,
				"getActivity:issue",
			);

			return {
				logs: result.map(
					(log: {
						action: string;
						actorName: string;
						description?: string;
						_creationTime: number;
						field?: string;
						oldValue?: string;
						newValue?: string;
					}) => ({
						action: log.action,
						actorName: log.actorName,
						description: log.description ?? null,
						timestamp: log._creationTime,
						field: log.field ?? null,
						oldValue: log.oldValue ?? null,
						newValue: log.newValue ?? null,
					}),
				),
				total: result.length,
			};
		}

		// Project activity
		const result = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.listActivityByProject, {
				projectId: args.entityId as Id<"projects">,
				limit: args.limit,
			}),
			TOOL_TIMEOUT_MS,
			"getActivity:project",
		);

		return {
			logs: result.entries.map(
				(log: {
					action: string;
					actorName: string;
					description?: string;
					_creationTime: number;
					field?: string;
					oldValue?: string;
					newValue?: string;
				}) => ({
					action: log.action,
					actorName: log.actorName,
					description: log.description ?? null,
					timestamp: log._creationTime,
					field: log.field ?? null,
					oldValue: log.oldValue ?? null,
					newValue: log.newValue ?? null,
				}),
			),
			total: result.entries.length,
		};
	},
});

// ── 13. getNotifications ──────────────────────────────────────────────────

export const getNotifications = createTool({
	description:
		"Get notifications for the current user in the workspace. Shows recent alerts like issue assignments, status changes, comments, and project updates. Use this when the user asks about their notifications, alerts, or what's new.",
	inputSchema: z.object({
		filter: z
			.enum(["all", "unread", "read"])
			.optional()
			.default("all")
			.describe('Filter: "all", "unread", or "read" (default "all")'),
		limit: z
			.number()
			.optional()
			.default(20)
			.describe("Max notifications to return (default 20)"),
	}),
	execute: async (ctx: ToolContext, args): Promise<NotificationResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const userId = resolveToolUserId(ctx);

		const [result, unreadCount] = await Promise.all([
			withTimeout(
				ctx.runQuery(internal.ai.toolQueries.listNotifications, {
					workspaceId,
					userId,
					filter: args.filter,
					limit: args.limit,
				}),
				TOOL_TIMEOUT_MS,
				"getNotifications",
			),
			withTimeout(
				ctx.runQuery(internal.ai.toolQueries.unreadNotificationCount, {
					workspaceId,
					userId,
				}),
				TOOL_TIMEOUT_MS,
				"getNotifications:unreadCount",
			),
		]);

		const notifications: NotificationItem[] = result.notifications.map(
			(n: {
				_id: string;
				displayType: string;
				title: string;
				preview?: string | null;
				body?: string | null;
				isRead: boolean;
				actorName: string | null;
				issueIdentifier?: string | null;
				issueTitle?: string | null;
				documentTitle?: string | null;
				whiteboardTitle?: string | null;
				projectName?: string | null;
				_creationTime: number;
			}) => {
				// Determine the most relevant entity info
				let entityType: string | null = null;
				let entityTitle: string | null = null;

				if (n.issueIdentifier) {
					entityType = "issue";
					entityTitle = `${n.issueIdentifier}: ${n.issueTitle ?? ""}`.trim();
				} else if (n.documentTitle) {
					entityType = "document";
					entityTitle = n.documentTitle;
				} else if (n.whiteboardTitle) {
					entityType = "whiteboard";
					entityTitle = n.whiteboardTitle;
				} else if (n.projectName) {
					entityType = "project";
					entityTitle = n.projectName;
				}

				return {
					id: n._id,
					type: n.displayType,
					title: n.title,
					body: n.preview ?? n.body ?? null,
					isRead: n.isRead,
					actorName: n.actorName,
					entityType,
					entityTitle,
					createdAt: n._creationTime,
				};
			},
		);

		return { notifications, unreadCount };
	},
});

// ── 14. searchProjectKnowledge ────────────────────────────────────────────

/** Result shape for hybrid search items */
interface HybridSearchResult {
	sourceType: string;
	sourceId: string;
	title: string;
	snippet: string;
	score: number;
	metadata: Record<string, unknown>;
}

/** RRF (Reciprocal Rank Fusion) constant from the original paper */
const RRF_K = 60;

/** Maximum total tokens for search results (~4000 tokens ≈ 16000 chars) */
const MAX_RESULT_TOKENS = 4000;
const CHARS_PER_TOKEN = 4;
const MAX_RESULT_CHARS = MAX_RESULT_TOKENS * CHARS_PER_TOKEN;

/**
 * Merge vector search results and full-text search results using
 * Reciprocal Rank Fusion: score = Σ(1 / (k + rank_i))
 */
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

	// Score vector results
	for (let i = 0; i < vectorResults.length; i++) {
		const r = vectorResults[i];
		const key = `${r.sourceType}:${r.sourceId}`;
		scores.set(key, (scores.get(key) ?? 0) + 1 / (RRF_K + i + 1));
		if (!resultMap.has(key)) {
			resultMap.set(key, r);
		}
	}

	// Score text results
	for (let i = 0; i < textResults.length; i++) {
		const r = textResults[i];
		const key = `${r.sourceType}:${r.sourceId}`;
		scores.set(key, (scores.get(key) ?? 0) + 1 / (RRF_K + i + 1));
		if (!resultMap.has(key)) {
			resultMap.set(key, { ...r, metadata: {} });
		}
	}

	// Sort by score descending, take top N
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

/**
 * Truncate results to fit within a token budget.
 * Drops lower-ranked results when the total exceeds the limit.
 */
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
		if (totalChars + entryChars > MAX_RESULT_CHARS && kept.length > 0) {
			break;
		}
		kept.push(result);
		totalChars += entryChars;
	}

	return kept;
}

export const searchProjectKnowledge = createTool({
	description:
		"Deep search within a specific project using semantic (vector) and keyword search. Finds relevant issues, documents, comments, and code even when exact keywords don't match. Use this for project-scoped questions like 'what issues are related to the login bug?' or 'find docs about the API design'. Requires a projectId for semantic search; without it, only keyword search runs across the workspace.",
	inputSchema: z.object({
		query: z.string().describe("Natural language search query"),
		projectId: z
			.string()
			.optional()
			.describe(
				"Project ID to scope the search. Required for semantic search. Without it, only keyword search runs.",
			),
		contentTypes: z
			.array(z.enum(["issue", "document", "comment", "github_file"]))
			.optional()
			.describe(
				"Filter results to specific content types. Omit to search all types.",
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
		const workspaceId = await resolveWorkspaceId(ctx);
		const limit = args.limit ?? 10;
		const fetchLimit = 20; // Fetch more than needed for better RRF ranking

		// Determine which content types to include in full-text search
		const searchIssues =
			!args.contentTypes || args.contentTypes.includes("issue");
		const searchDocuments =
			!args.contentTypes || args.contentTypes.includes("document");

		// ── Run searches in parallel ─────────────────────────────────

		// 1. Vector search (only when projectId is provided)
		let vectorPromise: Promise<VectorSearchResult[]> | null = null;

		if (args.projectId) {
			vectorPromise = withTimeout(
				ctx.runAction(ragVectorSearch, {
					projectId: args.projectId,
					query: args.query,
					limit: fetchLimit,
					sourceTypeFilters: args.contentTypes,
					includeCode:
						!args.contentTypes || args.contentTypes.includes("github_file"),
				}),
				TOOL_TIMEOUT_MS,
				"searchProjectKnowledge:vector",
			);
		}

		// 2. Full-text search across issues and documents
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

		// Wait for all searches to complete
		const [vectorResults, ...textResultArrays] = await Promise.all([
			vectorPromise ?? Promise.resolve([] as VectorSearchResult[]),
			...textPromises,
		]);

		// Flatten text results
		const allTextResults = textResultArrays.flat();

		// ── Merge via RRF ────────────────────────────────────────────
		const mergedResults = rrfMerge(vectorResults, allTextResults, limit);

		// ── Truncate for context window ──────────────────────────────
		const truncated = truncateForContext(mergedResults);

		if (truncated.length === 0) {
			return [];
		}

		return truncated;
	},
});

// ── 15. searchCode ────────────────────────────────────────────────────────

export const searchCode = createTool({
	description:
		'Search indexed GitHub repository code using semantic search. Finds relevant code snippets, functions, classes, and modules. Use this only when the user asks about code implementation in a connected GitHub repo (e.g. "how does authentication work in the codebase?" or "find the JWT validation function"). Requires a projectId with a connected GitHub repository — will fail without one.',
	inputSchema: z.object({
		query: z
			.string()
			.describe(
				"Natural language description of code to find (e.g., 'authentication middleware', 'JWT validation function')",
			),
		projectId: z
			.string()
			.describe("Project ID that has a connected GitHub repository"),
		language: z
			.string()
			.optional()
			.describe(
				"Filter by programming language (e.g., 'typescript', 'python')",
			),
		filePath: z
			.string()
			.optional()
			.describe(
				"Filter by file path pattern (e.g., 'src/auth/', 'convex/'). Matches if the file path contains this string.",
			),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<CodeSearchResult[] | ErrorResult> => {
		await resolveWorkspaceId(ctx);

		if (!args.projectId) {
			return { error: "projectId is required for code search." };
		}

		const limit = 10;

		// Run code-specific vector search
		const results = await withTimeout(
			ctx.runAction(ragCodeSearch, {
				projectId: args.projectId,
				query: args.query,
				limit: limit * 2, // Fetch extra for post-filtering
			}),
			TOOL_TIMEOUT_MS,
			"searchCode",
		);

		// Apply in-memory filters
		let filtered = results;

		if (args.language) {
			const lang = args.language.toLowerCase();
			filtered = filtered.filter((r) => r.language.toLowerCase() === lang);
		}

		if (args.filePath) {
			const pathPattern = args.filePath.toLowerCase();
			filtered = filtered.filter((r) =>
				r.filePath.toLowerCase().includes(pathPattern),
			);
		}

		return filtered.slice(0, limit);
	},
});

// ── 16. listWhiteboards ──────────────────────────────────────────────────

interface WhiteboardListItem {
	id: string;
	title: string;
	icon: string | null;
	projectId: string | null;
	updatedAt: number;
	elementCount: number;
}

export const listWhiteboards = createTool({
	description:
		"List whiteboards/boards in the workspace. Optionally filter by project. Use this to discover existing boards before creating new ones, or when the user asks about boards.",
	inputSchema: z.object({
		projectId: z.string().optional().describe("Filter boards by project ID"),
		limit: z.number().optional().describe("Max boards to return (default 25)"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<WhiteboardListItem[] | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		const boards = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.listWhiteboards, {
				workspaceId,
				projectId: args.projectId
					? (args.projectId as Id<"projects">)
					: undefined,
				limit: args.limit,
			}),
			TOOL_TIMEOUT_MS,
			"listWhiteboards",
		);

		return boards.map((b) => ({
			id: b.id,
			title: b.title,
			icon: b.icon,
			projectId: b.projectId,
			updatedAt: b.updatedAt,
			elementCount: b.elementCount,
		}));
	},
});

// ── 17. getWhiteboard ────────────────────────────────────────────────────

interface WhiteboardDetailResult {
	id: string;
	title: string;
	icon: string | null;
	projectId: string | null;
	projectName: string | null;
	creatorName: string;
	lastEditorName: string | null;
	updatedAt: number;
	createdAt: number;
	elementCount: number;
	contentSummary: string | null;
	visibility: string;
	isPinned: boolean;
}

export const getWhiteboard = createTool({
	description:
		"Get details of a specific whiteboard/board including element count and content summary. Use this to understand what's on a board before generating diagrams or making updates.",
	inputSchema: z.object({
		whiteboardId: z.string().describe("The whiteboard/board ID to retrieve"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<WhiteboardDetailResult | ErrorResult> => {
		const _workspaceId = await resolveWorkspaceId(ctx);

		const board = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.getWhiteboardDetails, {
				whiteboardId: args.whiteboardId as Id<"whiteboards">,
			}),
			TOOL_TIMEOUT_MS,
			"getWhiteboard",
		);

		if (!board) {
			return { error: "Whiteboard not found or has been deleted." };
		}

		if (board.id !== args.whiteboardId) {
			// Sanity check — shouldn't happen
		}

		return {
			id: board.id,
			title: board.title,
			icon: board.icon,
			projectId: board.projectId,
			projectName: board.projectName,
			creatorName: board.creatorName,
			lastEditorName: board.lastEditorName,
			updatedAt: board.updatedAt,
			createdAt: board.createdAt,
			elementCount: board.elementCount,
			contentSummary: board.contentSummary,
			visibility: board.visibility,
			isPinned: board.isPinned,
		};
	},
});

// ── 18. exportWhiteboardForPlanning ───────────────────────────────────────

interface ExportWhiteboardChunkResult {
	whiteboardId: string;
	title: string;
	projectId: string | null;
	projectName: string | null;
	elementCount: number;
	totalTextItems: number;
	totalChunks: number;
	chunkIndex: number;
	markdown: string;
}

export const exportWhiteboardForPlanning = createTool({
	description:
		"Export ALL extractable text from a whiteboard for sprint planning or turning sticky notes into issues. Call with chunkIndex 0 first; if totalChunks > 1, call again with chunkIndex 1, 2, ... until you have read every chunk. Each line is numbered text from shapes, labels, and text elements. Embedded board images are not OCR'd — only text is exported. Use after listWhiteboards/getWhiteboard to pick a board ID.",
	inputSchema: z.object({
		whiteboardId: z
			.string()
			.describe("Whiteboard ID (from listWhiteboards or context)"),
		chunkIndex: z
			.number()
			.optional()
			.default(0)
			.describe("Zero-based chunk index when the board is large (default 0)"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<ExportWhiteboardChunkResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		const board = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.getWhiteboardById, {
				whiteboardId: args.whiteboardId as Id<"whiteboards">,
			}),
			TOOL_TIMEOUT_MS,
			"exportWhiteboardForPlanning",
		);

		if (!board) {
			return { error: "Whiteboard not found or access denied." };
		}
		if (board.workspaceId !== workspaceId) {
			return { error: "Whiteboard belongs to a different workspace." };
		}

		const chunk = await ctx.runQuery(
			internal.ai.toolQueries.exportWhiteboardPlanningChunk,
			{
				whiteboardId: args.whiteboardId as Id<"whiteboards">,
				chunkIndex: args.chunkIndex ?? 0,
			},
		);

		if (!chunk) {
			return { error: "Failed to export whiteboard." };
		}

		return {
			whiteboardId: chunk.whiteboardId,
			title: chunk.title,
			projectId: chunk.projectId,
			projectName: chunk.projectName,
			elementCount: chunk.elementCount,
			totalTextItems: chunk.totalTextItems,
			totalChunks: chunk.totalChunks,
			chunkIndex: chunk.chunkIndex,
			markdown: chunk.markdown,
		};
	},
});

// ── 19. readBoardWithVision ───────────────────────────────────────────────

export interface ReadBoardWithVisionResult {
	whiteboardId: string;
	title: string;
	projectId: string | null;
	projectName: string | null;
	elementCount: number;
	totalTextItems: number;
	totalChunks: number;
	chunkIndex: number;
	markdown: string;
	imageCount: number;
	images: Array<{ dataUrl: string; mediaType: string }>;
}

/**
 * Build the multipart tool output for readBoardWithVision — pure function
 * so it can be unit-tested without a Convex runtime.
 */
export function buildReadBoardWithVisionOutput(
	output: ReadBoardWithVisionResult | ErrorResult,
):
	| { type: "error-text"; value: string }
	| { type: "content"; value: ToolContentPart[] } {
	if (output && typeof output === "object" && "error" in output) {
		return { type: "error-text", value: String(output.error) };
	}
	const result = output as ReadBoardWithVisionResult;
	const header = [
		`# Whiteboard "${result.title}"`,
		`Board ID: ${result.whiteboardId}`,
		result.projectName ? `Project: ${result.projectName}` : null,
		`Elements: ${result.elementCount}, text items: ${result.totalTextItems}`,
		`Chunk ${result.chunkIndex + 1}/${result.totalChunks}`,
		result.imageCount > 0
			? `${result.imageCount} embedded image(s) attached below — inspect them visually.`
			: "No embedded images on this board.",
		"",
		result.markdown || "(no text extracted)",
	]
		.filter((l) => l !== null)
		.join("\n");

	const parts: ToolContentPart[] = [{ type: "text", text: header }];

	for (const img of result.images) {
		const comma = img.dataUrl.indexOf(",");
		const data = comma >= 0 ? img.dataUrl.slice(comma + 1) : img.dataUrl;
		parts.push({ type: "image-data", data, mediaType: img.mediaType });
	}

	return { type: "content", value: parts };
}

export const readBoardWithVision = createTool({
	description:
		"Read a whiteboard/board AND see its embedded images (diagrams, screenshots, photos). Returns text export plus vision attachments — unlike exportWhiteboardForPlanning, image pixels are passed to the model. Use this when turning a board into a sprint/project/issues, or when the user asks the agent to understand what is drawn on a board. Chunked like exportWhiteboardForPlanning: pass chunkIndex 0 first; images are only attached on chunkIndex 0 to avoid duplication.",
	inputSchema: z.object({
		whiteboardId: z.string().describe("Whiteboard ID to read"),
		chunkIndex: z
			.number()
			.optional()
			.default(0)
			.describe("Zero-based chunk index for large boards (default 0)"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<ReadBoardWithVisionResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		const board = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.getWhiteboardById, {
				whiteboardId: args.whiteboardId as Id<"whiteboards">,
			}),
			TOOL_TIMEOUT_MS,
			"readBoardWithVision",
		);

		if (!board) return { error: "Whiteboard not found or access denied." };
		if (board.workspaceId !== workspaceId) {
			return { error: "Whiteboard belongs to a different workspace." };
		}

		// Load full scene JSON: use file storage if the board was too large to inline.
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
				// fall back to inline sceneData
			}
		}

		const elements = getSceneElementsArray(sceneJson);
		const items = extractBoardTextItems(elements);
		const md = itemsToMarkdown(items);
		const chunks =
			md.length === 0 ? [""] : chunkString(md, BOARD_EXPORT_CHUNK_CHARS);
		const totalChunks = Math.max(1, chunks.length);
		const chunkIndex = Math.min(
			Math.max(0, args.chunkIndex ?? 0),
			totalChunks - 1,
		);
		const markdown = chunks[chunkIndex] ?? "";

		// Only attach images on the first chunk to avoid paying for them
		// multiple times if the model paginates through a big board.
		const rawImages =
			chunkIndex === 0 ? extractEmbeddedBoardImages(sceneJson) : [];
		const images = rawImages
			.slice(0, MAX_BOARD_VISION_IMAGES)
			.map((img) => ({ dataUrl: img.url, mediaType: img.mediaType }));

		return {
			whiteboardId: board._id,
			title: board.title,
			projectId: board.projectId ?? null,
			projectName: null,
			elementCount: elements.filter(
				(el) =>
					el &&
					typeof el === "object" &&
					!(el as { isDeleted?: boolean }).isDeleted,
			).length,
			totalTextItems: items.length,
			totalChunks,
			chunkIndex,
			markdown,
			imageCount: images.length,
			images,
		};
	},
	toModelOutput: (_ctx, { output }) =>
		buildReadBoardWithVisionOutput(
			output as ReadBoardWithVisionResult | ErrorResult,
		),
});

// ── 20. listBoardImages ───────────────────────────────────────────────────

interface BoardImageListItem {
	imageId: string;
	fileKey: string;
	mediaType: string;
	byteSize: number;
	caption: string | null;
	ocrText: string | null;
}

export const listBoardImages = createTool({
	description:
		"List persisted image attachments (diagrams, screenshots, sketches) from a whiteboard. Returns each image's imageId — pass those to createIssue/createProject/bulkCreateIssues as `attachBoardImageIds` to embed the images in the generated description as markdown. Use after readBoardWithVision when the user wants specific board visuals inlined into issues or projects.",
	inputSchema: z.object({
		whiteboardId: z.string().describe("The whiteboard ID to list images for"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<BoardImageListItem[] | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const board = await withTimeout(
			ctx.runQuery(internal.ai.toolQueries.getWhiteboardById, {
				whiteboardId: args.whiteboardId as Id<"whiteboards">,
			}),
			TOOL_TIMEOUT_MS,
			"listBoardImages",
		);
		if (!board) return { error: "Whiteboard not found." };
		if (board.workspaceId !== workspaceId) {
			return { error: "Whiteboard belongs to a different workspace." };
		}

		const rows = await ctx.runQuery(
			internal.ai.whiteboardImageSync.listBoardImages,
			{ whiteboardId: args.whiteboardId as Id<"whiteboards"> },
		);
		return rows.map((r) => ({
			imageId: r._id,
			fileKey: r.fileKey,
			mediaType: r.mediaType,
			byteSize: r.byteSize,
			caption: r.caption ?? null,
			ocrText: r.ocrText ?? null,
		}));
	},
});

// ── Export all read tools as a named toolset ─────────────────────────────

export const readTools = {
	searchIssues,
	listProjects,
	getIssueDetails,
	getDocument,
	readDocumentChunked,
	readDocumentWithVision,
	searchDocuments,
	globalSearch,
	listWorkspaceMembers,
	getProjectDetails,
	listLabels,
	listSprints,
	getActivity,
	getNotifications,
	searchProjectKnowledge,
	searchCode,
	listWhiteboards,
	getWhiteboard,
	exportWhiteboardForPlanning,
	readBoardWithVision,
	listBoardImages,
};
