import { createTool } from "@convex-dev/agent";
import { makeFunctionReference } from "convex/server";
import { z } from "zod";
import { api } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import {
	buildProjectNameMap,
	buildUserNameMap,
	MAX_CONTENT_LENGTH,
	plateJsonToPlainText,
	resolveWorkspaceId,
	TOOL_TIMEOUT_MS,
	truncateAtBoundary,
	withTimeout,
} from "./helpers";
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
	truncated: boolean;
	projectId: string | null;
	icon: string | null;
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
		const hasFilters = !!(
			args.status ||
			args.priority ||
			args.assigneeId ||
			args.projectId
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
				ctx.runQuery(api.issues.search, {
					workspaceId,
					searchTerm: args.query,
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
							if (args.assigneeId && issue.assigneeId !== args.assigneeId)
								return false;
							if (args.projectId && issue.projectId !== args.projectId)
								return false;
							return true;
						},
					)
				: results;

			return filtered.slice(0, args.limit).map(mapIssue);
		}

		// Use filtered list query when no text search is needed
		const result = await withTimeout(
			ctx.runQuery(api.issues.listByWorkspace, {
				workspaceId,
				status: args.status,
				priority: args.priority,
				assigneeId: args.assigneeId as Id<"users"> | undefined,
				projectId: args.projectId as Id<"projects"> | undefined,
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

		// projects.list already handles RBAC via getAccessibleProjectIds
		const projects = await withTimeout(
			ctx.runQuery(api.projects.list, { workspaceId }),
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
				ctx.runQuery(api.projects.getStats, {
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

		// Fetch issue by identifier or ID
		let issue: Awaited<
			ReturnType<typeof ctx.runQuery<typeof api.issues.getById>>
		>;

		if (args.identifier) {
			issue = await ctx.runQuery(api.issues.getByIdentifier, {
				workspaceId,
				identifier: args.identifier,
			});
		} else {
			issue = await ctx.runQuery(api.issues.getById, {
				issueId: args.issueId as Id<"issues">,
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
				ctx.runQuery(api.labels.list, { workspaceId }),
				ctx.runQuery(api.issues.getSubIssues, {
					parentId: issue._id as Id<"issues">,
				}),
				ctx.runQuery(api.comments.listByIssue, {
					issueId: issue._id as Id<"issues">,
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
		"Get a document by its ID, returning its title and content. Use this when the user asks about a specific document. Content is truncated to stay within token limits.",
	inputSchema: z.object({
		documentId: z.string().describe("The document ID to retrieve"),
	}),
	execute: async (
		ctx: ToolContext,
		args,
	): Promise<DocumentResult | ErrorResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);
		const document = await ctx.runQuery(api.documents.getById, {
			documentId: args.documentId as Id<"documents">,
		});

		if (!document) {
			return { error: "Document not found." };
		}

		// Verify document belongs to the resolved workspace
		if (document.workspaceId !== workspaceId) {
			return { error: "Document not found." };
		}

		const plainText = plateJsonToPlainText(document.content);
		const truncated = plainText.length > MAX_CONTENT_LENGTH;
		const content = truncated
			? truncateAtBoundary(plainText, MAX_CONTENT_LENGTH)
			: plainText;

		return {
			id: document._id,
			title: document.title,
			content,
			truncated,
			projectId: document.projectId ?? null,
			icon: document.icon ?? null,
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

		const [documents, projectNames] = await Promise.all([
			withTimeout(
				ctx.runQuery(api.documents.listByWorkspace, { workspaceId }),
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

// ── 6. globalSearch ──────────────────────────────────────────────────────

export const globalSearch = createTool({
	description:
		"Search across all entity types in the workspace: issues, projects, documents, whiteboards, clients, stories, and tasks. Use this for broad searches when the user's intent spans multiple categories.",
	inputSchema: z.object({
		query: z.string().describe("The search term"),
	}),
	execute: async (ctx: ToolContext, args): Promise<GlobalSearchResult> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		const results = await withTimeout(
			ctx.runQuery(api.search.global, { workspaceId, searchTerm: args.query }),
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

		const members = await ctx.runQuery(api.workspaceMembers.list, {
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

		// Lookup by ID or slug
		let project: Awaited<
			ReturnType<typeof ctx.runQuery<typeof api.projects.getById>>
		>;

		if (args.slug) {
			project = await ctx.runQuery(api.projects.getBySlug, {
				workspaceId,
				slug: args.slug,
			});
		} else {
			project = await ctx.runQuery(api.projects.getById, {
				projectId: args.projectId as Id<"projects">,
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
			ctx.runQuery(api.projects.getStats, { projectId: project._id }),
			ctx.runQuery(api.milestones.listByProject, {
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

		const labels = await ctx.runQuery(api.labels.list, {
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
		"List all sprints across all projects in the workspace. Returns sprint name, status, dates, project name, and progress. Use this when the user asks about sprints, current iterations, or sprint progress.",
	inputSchema: z.object({
		status: z
			.enum(["planned", "active", "completed", "cancelled"])
			.optional()
			.describe("Filter by sprint status"),
	}),
	execute: async (ctx: ToolContext, args): Promise<SprintResult[]> => {
		const workspaceId = await resolveWorkspaceId(ctx);

		const sprints = await ctx.runQuery(api.sprints.listByWorkspace, {
			workspaceId,
		});

		const filtered = args.status
			? sprints.filter((s: { status?: string }) => s.status === args.status)
			: sprints;

		return filtered.map(
			(sprint: {
				_id: string;
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
				ctx.runQuery(api.activityLogs.listByIssue, {
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
			ctx.runQuery(api.activityLogs.listByProject, {
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

		const [result, unreadCount] = await Promise.all([
			withTimeout(
				ctx.runQuery(api.notifications.list, {
					workspaceId,
					filter: args.filter,
					limit: args.limit,
				}),
				TOOL_TIMEOUT_MS,
				"getNotifications",
			),
			withTimeout(
				ctx.runQuery(api.notifications.unreadCount, { workspaceId }),
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
		"Search the project knowledge base using semantic (vector) and keyword search. Finds relevant issues, documents, comments, and code even when exact keywords don't match. Use this when the user asks questions about project content, wants to find related items, or needs context from the project knowledge base. Requires a projectId for semantic search.",
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
		'Search indexed GitHub repository code using semantic search. Finds relevant code snippets, functions, classes, and modules even when exact keywords don\'t match. Use this when the user asks about code implementation, wants to find specific functions/classes, or asks "how does X work in the codebase?". Requires a projectId with a connected GitHub repository.',
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

// ── Export all read tools as a named toolset ─────────────────────────────

export const readTools = {
	searchIssues,
	listProjects,
	getIssueDetails,
	getDocument,
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
};
