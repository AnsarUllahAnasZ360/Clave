import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { logActivity } from "./lib/activity";
import {
	canAccessProject,
	getAccessibleProjectIds,
	requireProjectAccess,
	requireWorkspaceAdmin,
	requireWorkspaceMember,
} from "./lib/auth";
import { notifyUsers } from "./lib/notifications";
import { generateSlug } from "./lib/utils";

function slugifyKey(input: string): string {
	return input
		.trim()
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, "_")
		.replace(/^_+|_+$/g, "")
		.slice(0, 48);
}

function dedupeKey(base: string, existing: ReadonlySet<string>): string {
	if (!existing.has(base)) return base;
	let i = 2;
	while (existing.has(`${base}_${i}`)) i += 1;
	return `${base}_${i}`;
}

const DEFAULT_STATUS_KEYS = [
	"triage",
	"backlog",
	"todo",
	"in_progress",
	"in_review",
	"done",
	"cancelled",
] as const;

const DEFAULT_TYPE_KEYS = ["issue", "bug", "improvement", "feature"] as const;

// ── Queries ────────────────────────────────────────────────────────────────

const projectDocValidator = v.object({
	_id: v.id("projects"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	name: v.string(),
	slug: v.string(),
	description: v.optional(v.string()),
	summary: v.optional(v.string()),
	richDescription: v.optional(v.string()),
	icon: v.optional(v.string()),
	color: v.optional(v.string()),
	status: v.string(),
	priority: v.optional(v.string()),
	leadId: v.optional(v.id("users")),
	clientId: v.optional(v.id("clients")),
	startDate: v.optional(v.number()),
	endDate: v.optional(v.number()),
	intent: v.optional(v.string()),
	successType: v.optional(v.string()),
	structure: v.optional(v.string()),
	scopeInItems: v.optional(v.array(v.string())),
	scopeOutItems: v.optional(v.array(v.string())),
	outcomes: v.optional(v.array(v.string())),
	resources: v.optional(
		v.array(v.object({ url: v.string(), label: v.string() })),
	),
	typeLabel: v.optional(v.string()),
	tags: v.optional(v.array(v.string())),
	customStatuses: v.optional(
		v.array(v.object({ key: v.string(), name: v.string(), color: v.string() })),
	),
	// Persisted drag-to-reorder order for the merged status list at this
	// project's scope. Must stay in sync with the schema field.
	customStatusOrder: v.optional(v.array(v.string())),
	customTypes: v.optional(
		v.array(v.object({ key: v.string(), name: v.string(), color: v.string() })),
	),
	sortOrder: v.number(),
	createdBy: v.id("users"),
	updatedAt: v.optional(v.number()),
	deletedAt: v.optional(v.number()),
});

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(projectDocValidator),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_workspace_sort", (q) =>
				q.eq("workspaceId", args.workspaceId),
			)
			.collect();
		const active = projects.filter((p) => !p.deletedAt);
		const accessible = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			userId,
			member.role,
		);
		if (accessible === null) return active;
		return active.filter((p) => accessible.has(p._id));
	},
});

export const listActive = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(
		v.object({
			_id: v.id("projects"),
			name: v.string(),
			slug: v.string(),
			color: v.string(),
			icon: v.optional(v.string()),
			status: v.string(),
		}),
	),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_workspace_status", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("status", "active"),
			)
			.collect();
		const active = projects.filter((p) => !p.deletedAt);
		const accessible = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			userId,
			member.role,
		);
		const filtered =
			accessible === null
				? active
				: active.filter((p) => accessible.has(p._id));
		return filtered.map((p) => ({
			_id: p._id,
			name: p.name,
			slug: p.slug,
			color: p.color || "var(--chart-3)",
			icon: p.icon,
			status: p.status,
		}));
	},
});

const sidebarSprintValidator = v.object({
	_id: v.id("sprints"),
	name: v.string(),
	status: v.string(),
	icon: v.optional(v.string()),
	folderId: v.optional(v.id("sprintFolders")),
	issueCount: v.number(),
	completedCount: v.number(),
});

const sidebarFolderValidator = v.object({
	_id: v.id("sprintFolders"),
	name: v.string(),
	icon: v.optional(v.string()),
	sprints: v.array(sidebarSprintValidator),
});

export const listSidebarTree = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(
		v.object({
			_id: v.id("projects"),
			name: v.string(),
			slug: v.string(),
			color: v.string(),
			icon: v.optional(v.string()),
			status: v.string(),
			sprintFolders: v.array(sidebarFolderValidator),
			looseSprints: v.array(sidebarSprintValidator),
			backlogCount: v.number(),
			docs: v.array(
				v.object({
					_id: v.id("documents"),
					title: v.string(),
				}),
			),
			boards: v.array(
				v.object({
					_id: v.id("whiteboards"),
					title: v.string(),
				}),
			),
		}),
	),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);
		// Show all projects (not just active) for full sidebar tree
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		const active = projects.filter((p) => !p.deletedAt);
		const accessible = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			userId,
			member.role,
		);
		const filtered =
			accessible === null
				? active
				: active.filter((p) => accessible.has(p._id));

		// Single scan of all workspace issues for efficient counting
		const allIssues = await ctx.db
			.query("issues")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		const activeIssues = allIssues.filter((i) => !i.deletedAt);

		const issuesBySprintId = new Map<
			string,
			{ total: number; completed: number }
		>();
		const backlogByProjectId = new Map<string, number>();

		for (const issue of activeIssues) {
			if (issue.sprintId) {
				const key = issue.sprintId as string;
				const stats = issuesBySprintId.get(key) ?? {
					total: 0,
					completed: 0,
				};
				stats.total++;
				if (issue.status === "done" || issue.status === "cancelled") {
					stats.completed++;
				}
				issuesBySprintId.set(key, stats);
			} else if (issue.projectId) {
				const key = issue.projectId as string;
				backlogByProjectId.set(key, (backlogByProjectId.get(key) ?? 0) + 1);
			}
		}

		const results = await Promise.all(
			filtered.map(async (project) => {
				const [sprints, folders, docs, boards] = await Promise.all([
					ctx.db
						.query("sprints")
						.withIndex("by_project_sort", (q) => q.eq("projectId", project._id))
						.collect(),
					ctx.db
						.query("sprintFolders")
						.withIndex("by_project_sort", (q) => q.eq("projectId", project._id))
						.collect(),
					ctx.db
						.query("documents")
						.withIndex("by_project", (q) => q.eq("projectId", project._id))
						.collect(),
					ctx.db
						.query("whiteboards")
						.withIndex("by_project", (q) => q.eq("projectId", project._id))
						.collect(),
				]);

				const activeSprints = sprints
					.filter(
						(s) =>
							!s.deletedAt && (s.status === "active" || s.status === "planned"),
					)
					.map((s) => {
						const stats = issuesBySprintId.get(s._id as string) ?? {
							total: 0,
							completed: 0,
						};
						return {
							_id: s._id,
							name: s.name,
							status: s.status,
							icon: s.icon,
							folderId: s.folderId,
							issueCount: stats.total,
							completedCount: stats.completed,
						};
					});

				const activeFolders = folders.filter((f) => !f.deletedAt);

				// Group sprints by folder
				const sprintFolders = activeFolders.map((folder) => ({
					_id: folder._id,
					name: folder.name,
					icon: folder.icon,
					sprints: activeSprints.filter((s) => s.folderId === folder._id),
				}));

				// Sprints not in any folder
				const looseSprints = activeSprints.filter((s) => !s.folderId);

				return {
					_id: project._id,
					name: project.name,
					slug: project.slug,
					color: project.color || "var(--chart-3)",
					icon: project.icon,
					status: project.status,
					sprintFolders,
					looseSprints,
					backlogCount: backlogByProjectId.get(project._id as string) ?? 0,
					docs: docs
						.filter((d) => !d.deletedAt)
						.slice(0, 5)
						.map((d) => ({ _id: d._id, title: d.title || "Untitled" })),
					boards: boards
						.filter((b) => !b.deletedAt)
						.slice(0, 5)
						.map((b) => ({ _id: b._id, title: b.title || "Untitled" })),
				};
			}),
		);

		return results;
	},
});

export const getById = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.union(projectDocValidator, v.null()),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return null;
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			project.workspaceId,
		);
		const hasAccess = await canAccessProject(
			ctx,
			args.projectId,
			userId,
			member.role,
		);
		if (!hasAccess) return null;
		return project;
	},
});

export const getBySlug = query({
	args: {
		workspaceId: v.id("workspaces"),
		slug: v.string(),
	},
	returns: v.union(projectDocValidator, v.null()),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);
		const project = await ctx.db
			.query("projects")
			.withIndex("by_workspace_slug", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("slug", args.slug),
			)
			.unique();
		if (!project || project.deletedAt) return null;
		const hasAccess = await canAccessProject(
			ctx,
			project._id,
			userId,
			member.role,
		);
		if (!hasAccess) return null;
		return project;
	},
});

export const getStats = query({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.union(
		v.object({
			backlog: v.number(),
			todo: v.number(),
			in_progress: v.number(),
			done: v.number(),
			total: v.number(),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return null;
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			project.workspaceId,
		);
		const hasAccess = await canAccessProject(
			ctx,
			args.projectId,
			userId,
			member.role,
		);
		if (!hasAccess) return null;

		const issues = await ctx.db
			.query("issues")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		const active = issues.filter((i) => !i.deletedAt && !i.parentId);
		const counts = { backlog: 0, todo: 0, in_progress: 0, done: 0, total: 0 };

		for (const issue of active) {
			counts.total++;
			if (issue.status === "backlog" || issue.status === "triage") {
				counts.backlog++;
			} else if (issue.status === "todo") {
				counts.todo++;
			} else if (
				issue.status === "in_progress" ||
				issue.status === "in_review"
			) {
				counts.in_progress++;
			} else if (issue.status === "done" || issue.status === "cancelled") {
				counts.done++;
			}
		}

		return counts;
	},
});

/** Issue counts and member info for all projects in a workspace */
export const getWorkspaceProjectSummaries = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.record(
		v.string(),
		v.object({
			issueCount: v.number(),
			doneCount: v.number(),
			members: v.array(
				v.object({
					name: v.union(v.string(), v.null()),
					image: v.union(v.string(), v.null()),
				}),
			),
		}),
	),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);
		const accessible = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			userId,
			member.role,
		);

		const accessibleProjects =
			accessible === null
				? (
						await ctx.db
							.query("projects")
							.withIndex("by_workspace", (q) =>
								q.eq("workspaceId", args.workspaceId),
							)
							.collect()
					).filter((p) => !p.deletedAt)
				: await (async () => {
						if (accessible.size === 0) return [];
						const fetched = await Promise.all(
							[...accessible].map((id) => ctx.db.get(id as Id<"projects">)),
						);
						const projects: Exclude<(typeof fetched)[number], null>[] = [];
						for (const project of fetched) {
							if (
								!project ||
								project.deletedAt ||
								project.workspaceId !== args.workspaceId
							) {
								continue;
							}
							projects.push(project);
						}
						return projects;
					})();
		if (accessibleProjects.length === 0) return {};

		const issueCountsByProject = new Map<
			string,
			{ issueCount: number; doneCount: number }
		>();

		const addIssueCounts = (
			issues: Array<{
				projectId?: string;
				parentId?: string;
				deletedAt?: number;
				status: string;
			}>,
		) => {
			for (const issue of issues) {
				if (issue.deletedAt || issue.parentId || !issue.projectId) continue;
				const current = issueCountsByProject.get(issue.projectId);
				const isDone = issue.status === "done" || issue.status === "cancelled";
				if (current) {
					current.issueCount += 1;
					if (isDone) current.doneCount += 1;
				} else {
					issueCountsByProject.set(issue.projectId, {
						issueCount: 1,
						doneCount: isDone ? 1 : 0,
					});
				}
			}
		};

		if (accessible === null) {
			// Admins can see everything: keep a single workspace scan.
			const allIssues = await ctx.db
				.query("issues")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.collect();
			addIssueCounts(allIssues);
		} else {
			// Members: only scan issue rows for projects they can access.
			const issueArrays = await Promise.all(
				accessibleProjects.map((project) =>
					ctx.db
						.query("issues")
						.withIndex("by_project", (q) => q.eq("projectId", project._id))
						.collect(),
				),
			);
			for (const issues of issueArrays) addIssueCounts(issues);
		}

		// Batch-fetch all projectMembers for all projects in parallel
		const allMembersArrays = await Promise.all(
			accessibleProjects.map((project) =>
				ctx.db
					.query("projectMembers")
					.withIndex("by_project", (q) => q.eq("projectId", project._id))
					.collect(),
			),
		);

		// Collect unique userIds from all project members
		const uniqueUserIds = new Set<string>();
		for (const members of allMembersArrays) {
			for (const m of members) {
				uniqueUserIds.add(m.userId);
			}
		}

		// Batch-fetch all users in parallel
		const userResults =
			uniqueUserIds.size > 0
				? await Promise.all(
						[...uniqueUserIds].map((id) => ctx.db.get(id as Id<"users">)),
					)
				: [];
		const userMap = new Map(
			[...uniqueUserIds].map((id, i) => [id, userResults[i]]),
		);

		const result: Record<
			string,
			{
				issueCount: number;
				doneCount: number;
				members: Array<{ name: string | null; image: string | null }>;
			}
		> = {};

		for (let i = 0; i < accessibleProjects.length; i++) {
			const project = accessibleProjects[i];
			const members = allMembersArrays[i];
			const stats = issueCountsByProject.get(project._id) ?? {
				issueCount: 0,
				doneCount: 0,
			};

			const memberProfiles = members.map((m) => {
				const user = userMap.get(m.userId);
				return { name: user?.name ?? null, image: user?.image ?? null };
			});

			result[project._id] = {
				issueCount: stats.issueCount,
				doneCount: stats.doneCount,
				members: memberProfiles,
			};
		}

		return result;
	},
});

export const getTimeline = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(
		v.object({
			_id: v.id("projects"),
			name: v.string(),
			slug: v.string(),
			status: v.string(),
			priority: v.optional(v.string()),
			startDate: v.optional(v.number()),
			endDate: v.optional(v.number()),
			color: v.optional(v.string()),
			icon: v.optional(v.string()),
		}),
	),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);
		const projects = await ctx.db
			.query("projects")
			.withIndex("by_workspace_sort", (q) =>
				q.eq("workspaceId", args.workspaceId),
			)
			.collect();

		const active = projects.filter((p) => !p.deletedAt);
		const accessible = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			userId,
			member.role,
		);
		const filtered =
			accessible === null
				? active
				: active.filter((p) => accessible.has(p._id));
		return filtered.map((p) => ({
			_id: p._id,
			name: p.name,
			slug: p.slug,
			status: p.status,
			priority: p.priority,
			startDate: p.startDate,
			endDate: p.endDate,
			color: p.color,
			icon: p.icon,
		}));
	},
});

// ── Mutations ──────────────────────────────────────────────────────────────

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.string(),
		description: v.optional(v.string()),
		richDescription: v.optional(v.string()),
		summary: v.optional(v.string()),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("backlog"),
				v.literal("planned"),
				v.literal("active"),
				v.literal("completed"),
				v.literal("cancelled"),
			),
		),
		priority: v.optional(
			v.union(
				v.literal("urgent"),
				v.literal("high"),
				v.literal("medium"),
				v.literal("low"),
				v.literal("no_priority"),
			),
		),
		leadId: v.optional(v.id("users")),
		clientId: v.optional(v.id("clients")),
		startDate: v.optional(v.number()),
		endDate: v.optional(v.number()),
		intent: v.optional(
			v.union(
				v.literal("delivery"),
				v.literal("experiment"),
				v.literal("internal"),
			),
		),
		successType: v.optional(
			v.union(
				v.literal("deliverable"),
				v.literal("metric"),
				v.literal("undefined"),
			),
		),
		structure: v.optional(
			v.union(v.literal("linear"), v.literal("sprints"), v.literal("kanban")),
		),
		scopeInItems: v.optional(v.array(v.string())),
		scopeOutItems: v.optional(v.array(v.string())),
		outcomes: v.optional(v.array(v.string())),
		resources: v.optional(
			v.array(v.object({ url: v.string(), label: v.string() })),
		),
		typeLabel: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
	},
	returns: v.id("projects"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		// Generate unique slug
		let baseSlug = generateSlug(args.name);
		if (!baseSlug) baseSlug = "project";
		let slug = baseSlug;
		let suffix = 2;

		while (true) {
			const existing = await ctx.db
				.query("projects")
				.withIndex("by_workspace_slug", (q) =>
					q.eq("workspaceId", args.workspaceId).eq("slug", slug),
				)
				.unique();
			if (!existing) break;
			slug = `${baseSlug}-${suffix}`;
			suffix++;
		}

		// Compute sortOrder: append at end
		const lastProject = await ctx.db
			.query("projects")
			.withIndex("by_workspace_sort", (q) =>
				q.eq("workspaceId", args.workspaceId),
			)
			.order("desc")
			.first();
		const sortOrder = lastProject ? lastProject.sortOrder + 1.0 : 1.0;

		// Strip HTML tags for plain text description fallback
		const plainDescription = args.description?.replace(/<[^>]*>/g, "").trim();

		const projectId = await ctx.db.insert("projects", {
			workspaceId: args.workspaceId,
			name: args.name,
			slug,
			description: plainDescription || undefined,
			richDescription: args.richDescription ?? args.description,
			summary: args.summary,
			icon: args.icon,
			color: args.color,
			status: args.status ?? "planned",
			priority: args.priority ?? "no_priority",
			leadId: args.leadId,
			clientId: args.clientId,
			startDate: args.startDate,
			endDate: args.endDate,
			intent: args.intent,
			successType: args.successType,
			structure: args.structure,
			scopeInItems: args.scopeInItems,
			scopeOutItems: args.scopeOutItems,
			outcomes: args.outcomes,
			resources: args.resources,
			typeLabel: args.typeLabel,
			tags: args.tags,
			sortOrder,
			createdBy: userId,
		});

		// Add creator as project owner
		await ctx.db.insert("projectMembers", {
			projectId,
			userId,
			role: "owner",
			addedAt: Date.now(),
		});

		// Activity log
		await logActivity(ctx, {
			workspaceId: args.workspaceId,
			entityType: "project",
			entityId: projectId,
			action: "created",
			actorId: userId,
			description: `created project "${args.name}"`,
			projectId,
		});

		return projectId;
	},
});

export const update = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		richDescription: v.optional(v.string()),
		summary: v.optional(v.string()),
		icon: v.optional(v.string()),
		color: v.optional(v.string()),
		status: v.optional(
			v.union(
				v.literal("backlog"),
				v.literal("planned"),
				v.literal("active"),
				v.literal("completed"),
				v.literal("cancelled"),
			),
		),
		priority: v.optional(
			v.union(
				v.literal("urgent"),
				v.literal("high"),
				v.literal("medium"),
				v.literal("low"),
				v.literal("no_priority"),
			),
		),
		leadId: v.optional(v.id("users")),
		clientId: v.optional(v.id("clients")),
		// `null` = explicit clear sentinel (Convex drops `undefined` keys
		// from mutation args on the wire, so undefined can't mean "clear").
		startDate: v.optional(v.union(v.number(), v.null())),
		endDate: v.optional(v.union(v.number(), v.null())),
		intent: v.optional(
			v.union(
				v.literal("delivery"),
				v.literal("experiment"),
				v.literal("internal"),
			),
		),
		successType: v.optional(
			v.union(
				v.literal("deliverable"),
				v.literal("metric"),
				v.literal("undefined"),
			),
		),
		structure: v.optional(
			v.union(v.literal("linear"), v.literal("sprints"), v.literal("kanban")),
		),
		scopeInItems: v.optional(v.array(v.string())),
		scopeOutItems: v.optional(v.array(v.string())),
		outcomes: v.optional(v.array(v.string())),
		resources: v.optional(
			v.array(v.object({ url: v.string(), label: v.string() })),
		),
		typeLabel: v.optional(v.string()),
		tags: v.optional(v.array(v.string())),
		customStatuses: v.optional(
			v.array(
				v.object({ key: v.string(), name: v.string(), color: v.string() }),
			),
		),
		customTypes: v.optional(
			v.array(
				v.object({ key: v.string(), name: v.string(), color: v.string() }),
			),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId } = await requireProjectAccess(
			ctx,
			args.projectId,
			project.workspaceId,
		);

		const { projectId, ...updates } = args;
		const patch: Record<string, unknown> = {
			...updates,
			updatedAt: Date.now(),
		};
		// Map null → undefined so ctx.db.patch deletes the field.
		if (args.startDate === null) patch.startDate = undefined;
		if (args.endDate === null) patch.endDate = undefined;
		await ctx.db.patch(projectId, patch);

		// Activity log
		await logActivity(ctx, {
			workspaceId: project.workspaceId,
			entityType: "project",
			entityId: projectId,
			action: "updated",
			actorId: userId,
			description: `updated project "${project.name}"`,
			projectId,
		});
	},
});

export const updateStatus = mutation({
	args: {
		projectId: v.id("projects"),
		status: v.union(
			v.literal("backlog"),
			v.literal("planned"),
			v.literal("active"),
			v.literal("completed"),
			v.literal("cancelled"),
		),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId } = await requireProjectAccess(
			ctx,
			args.projectId,
			project.workspaceId,
		);

		const oldStatus = project.status;
		await ctx.db.patch(args.projectId, {
			status: args.status,
			updatedAt: Date.now(),
		});

		// Activity log for status change
		if (args.status !== oldStatus) {
			const oldStatusLabel = oldStatus.replace(/_/g, " ");
			const newStatusLabel = args.status.replace(/_/g, " ");
			await logActivity(ctx, {
				workspaceId: project.workspaceId,
				entityType: "project",
				entityId: args.projectId,
				action: "status_changed",
				actorId: userId,
				description: `changed status from ${oldStatusLabel} to ${newStatusLabel}`,
				projectId: args.projectId,
				field: "status",
				oldValue: oldStatus,
				newValue: args.status,
			});
		}

		// Notify project members on status change (excluding actor)
		if (args.status !== oldStatus) {
			const actor = await ctx.db.get(userId);
			const actorName = actor?.name ?? "Someone";
			const statusLabel = args.status.replace(/_/g, " ");
			const body = `${actorName} changed project '${project.name}' status to ${statusLabel}`;

			// Get project members
			const members = await ctx.db
				.query("projectMembers")
				.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
				.collect();

			const memberUserIds = members.map((m) => m.userId);

			await notifyUsers(ctx, memberUserIds, {
				workspaceId: project.workspaceId,
				type: "project_update",
				title: "Project status changed",
				body,
				projectId: args.projectId,
				actorId: userId,
			});
		}
	},
});

export const createCustomIssueStatus = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		color: v.string(),
	},
	returns: v.object({ key: v.string() }),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireProjectAccess(ctx, args.projectId, project.workspaceId);
		const existing = new Set<string>();
		for (const k of DEFAULT_STATUS_KEYS) existing.add(k);
		for (const s of project.customStatuses ?? []) existing.add(s.key);
		const base = slugifyKey(args.name);
		if (!base) throw new ConvexError("Status name is required");
		const key = dedupeKey(base, existing);
		await ctx.db.patch(args.projectId, {
			customStatuses: [
				...(project.customStatuses ?? []),
				{ key, name: args.name, color: args.color },
			],
			updatedAt: Date.now(),
		});
		return { key };
	},
});

export const updateCustomIssueStatus = mutation({
	args: {
		projectId: v.id("projects"),
		key: v.string(),
		name: v.optional(v.string()),
		color: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireProjectAccess(ctx, args.projectId, project.workspaceId);
		const existing = project.customStatuses ?? [];
		const has = existing.some((s) => s.key === args.key);
		await ctx.db.patch(args.projectId, {
			customStatuses: has
				? existing.map((s) =>
						s.key === args.key
							? {
									...s,
									name: args.name ?? s.name,
									color: args.color ?? s.color,
								}
							: s,
					)
				: [
						...existing,
						{
							key: args.key,
							name: args.name ?? args.key.replaceAll("_", " "),
							color: args.color ?? "#6b7280",
						},
					],
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const deleteCustomIssueStatus = mutation({
	args: {
		projectId: v.id("projects"),
		key: v.string(),
		replacementKey: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireProjectAccess(ctx, args.projectId, project.workspaceId);
		if (args.key === args.replacementKey) {
			throw new ConvexError("Replacement must be different");
		}
		if ((DEFAULT_STATUS_KEYS as readonly string[]).includes(args.key)) {
			throw new ConvexError("Default statuses cannot be deleted");
		}
		const allowed = new Set<string>(DEFAULT_STATUS_KEYS);
		for (const s of project.customStatuses ?? []) allowed.add(s.key);
		if (!allowed.has(args.replacementKey)) {
			throw new ConvexError("Replacement status not found");
		}
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		for (const issue of issues) {
			if (issue.deletedAt) continue;
			if (issue.status !== args.key) continue;
			await ctx.db.patch(issue._id, { status: args.replacementKey });
		}
		await ctx.db.patch(args.projectId, {
			customStatuses: (project.customStatuses ?? []).filter(
				(s) => s.key !== args.key,
			),
			updatedAt: Date.now(),
		});
		return null;
	},
});

/**
 * Persist the project-scoped status display order. Overrides the workspace
 * order when set; clear by passing an empty array.
 */
export const reorderCustomIssueStatuses = mutation({
	args: {
		projectId: v.id("projects"),
		orderedKeys: v.array(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireProjectAccess(ctx, args.projectId, project.workspaceId);
		await ctx.db.patch(args.projectId, {
			customStatusOrder: args.orderedKeys,
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const createCustomIssueType = mutation({
	args: {
		projectId: v.id("projects"),
		name: v.string(),
		color: v.string(),
	},
	returns: v.object({ key: v.string() }),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireProjectAccess(ctx, args.projectId, project.workspaceId);
		const existing = new Set<string>();
		for (const k of DEFAULT_TYPE_KEYS) existing.add(k);
		for (const t of project.customTypes ?? []) existing.add(t.key);
		const base = slugifyKey(args.name);
		if (!base) throw new ConvexError("Type name is required");
		const key = dedupeKey(base, existing);
		await ctx.db.patch(args.projectId, {
			customTypes: [
				...(project.customTypes ?? []),
				{ key, name: args.name, color: args.color },
			],
			updatedAt: Date.now(),
		});
		return { key };
	},
});

export const updateCustomIssueType = mutation({
	args: {
		projectId: v.id("projects"),
		key: v.string(),
		name: v.optional(v.string()),
		color: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireProjectAccess(ctx, args.projectId, project.workspaceId);
		const existing = project.customTypes ?? [];
		const has = existing.some((t) => t.key === args.key);
		await ctx.db.patch(args.projectId, {
			customTypes: has
				? existing.map((t) =>
						t.key === args.key
							? {
									...t,
									name: args.name ?? t.name,
									color: args.color ?? t.color,
								}
							: t,
					)
				: [
						...existing,
						{
							key: args.key,
							name: args.name ?? args.key.replaceAll("_", " "),
							color: args.color ?? "#6b7280",
						},
					],
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const deleteCustomIssueType = mutation({
	args: {
		projectId: v.id("projects"),
		key: v.string(),
		replacementKey: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireProjectAccess(ctx, args.projectId, project.workspaceId);
		if (args.key === args.replacementKey) {
			throw new ConvexError("Replacement must be different");
		}
		if ((DEFAULT_TYPE_KEYS as readonly string[]).includes(args.key)) {
			throw new ConvexError("Default types cannot be deleted");
		}
		const allowed = new Set<string>(DEFAULT_TYPE_KEYS);
		for (const t of project.customTypes ?? []) allowed.add(t.key);
		if (!allowed.has(args.replacementKey)) {
			throw new ConvexError("Replacement type not found");
		}
		const issues = await ctx.db
			.query("issues")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();
		for (const issue of issues) {
			if (issue.deletedAt) continue;
			if (issue.type !== args.key) continue;
			await ctx.db.patch(issue._id, { type: args.replacementKey });
		}
		await ctx.db.patch(args.projectId, {
			customTypes: (project.customTypes ?? []).filter(
				(t) => t.key !== args.key,
			),
			updatedAt: Date.now(),
		});
		return null;
	},
});

export const remove = mutation({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireWorkspaceAdmin(ctx, project.workspaceId);

		await ctx.db.patch(args.projectId, {
			deletedAt: Date.now(),
		});
	},
});

export const removeClient = mutation({
	args: {
		projectId: v.id("projects"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId } = await requireProjectAccess(
			ctx,
			args.projectId,
			project.workspaceId,
		);

		const { _id, _creationTime, clientId: _removed, ...rest } = project;
		await ctx.db.replace(args.projectId, {
			...rest,
			updatedAt: Date.now(),
		});

		await logActivity(ctx, {
			workspaceId: project.workspaceId,
			entityType: "project",
			entityId: args.projectId,
			action: "updated",
			actorId: userId,
			description: `removed client from project "${project.name}"`,
			projectId: args.projectId,
		});
	},
});

export const reorder = mutation({
	args: {
		projectId: v.id("projects"),
		newSortOrder: v.float64(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireProjectAccess(ctx, args.projectId, project.workspaceId);

		await ctx.db.patch(args.projectId, {
			sortOrder: args.newSortOrder,
		});
	},
});
