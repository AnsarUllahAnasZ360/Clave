import { v } from "convex/values";
import { query } from "./_generated/server";
import { getAccessibleProjectIds, requireWorkspaceMember } from "./lib/auth";

/**
 * Global search across projects, issues, and clients.
 * Also searches deprecated stories/tasks tables for backward compatibility.
 * Returns up to 5 results per category, workspace-scoped.
 */
const identifierResultValidator = v.object({
	_id: v.id("issues"),
	identifier: v.string(),
	title: v.string(),
	status: v.string(),
	projectId: v.optional(v.id("projects")),
});

const storyResultValidator = v.object({
	_id: v.id("stories"),
	identifier: v.string(),
	title: v.string(),
	status: v.string(),
	projectId: v.optional(v.id("projects")),
});

const taskResultValidator = v.object({
	_id: v.id("tasks"),
	identifier: v.string(),
	title: v.string(),
	status: v.string(),
	projectId: v.optional(v.id("projects")),
});

export const global = query({
	args: {
		workspaceId: v.id("workspaces"),
		searchTerm: v.string(),
	},
	returns: v.object({
		projects: v.array(
			v.object({
				_id: v.id("projects"),
				name: v.string(),
				slug: v.string(),
				status: v.string(),
				icon: v.optional(v.string()),
				color: v.optional(v.string()),
			}),
		),
		issues: v.array(identifierResultValidator),
		stories: v.array(storyResultValidator),
		tasks: v.array(taskResultValidator),
		clients: v.array(
			v.object({
				_id: v.id("clients"),
				name: v.string(),
				status: v.string(),
			}),
		),
		documents: v.array(
			v.object({
				_id: v.id("documents"),
				title: v.string(),
				projectId: v.optional(v.id("projects")),
			}),
		),
		whiteboards: v.array(
			v.object({
				_id: v.id("whiteboards"),
				title: v.string(),
				projectId: v.optional(v.id("projects")),
			}),
		),
	}),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);
		const accessibleProjectIds = await getAccessibleProjectIds(
			ctx,
			args.workspaceId,
			userId,
			member.role as "admin" | "member",
		);

		const term = args.searchTerm.trim();
		if (!term)
			return {
				projects: [],
				issues: [],
				stories: [],
				tasks: [],
				clients: [],
				documents: [],
				whiteboards: [],
			};

		// Build set of accessible client IDs for member filtering
		let accessibleClientIds: Set<string> | null = null;
		if (accessibleProjectIds !== null) {
			accessibleClientIds = new Set<string>();
			const allProjects = await ctx.db
				.query("projects")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.collect();
			for (const p of allProjects) {
				if (!p.deletedAt && p.clientId && accessibleProjectIds.has(p._id)) {
					accessibleClientIds.add(p.clientId);
				}
			}
		}

		const [projects, issues, stories, tasks, clients, documents, whiteboards] =
			await Promise.all([
				ctx.db
					.query("projects")
					.withSearchIndex("search_name", (q) =>
						q.search("name", term).eq("workspaceId", args.workspaceId),
					)
					.take(10)
					.then((results) =>
						results
							.filter((p) => {
								if (p.deletedAt) return false;
								if (accessibleProjectIds !== null)
									return accessibleProjectIds.has(p._id);
								return true;
							})
							.slice(0, 5)
							.map((p) => ({
								_id: p._id,
								name: p.name,
								slug: p.slug,
								status: p.status,
								icon: p.icon,
								color: p.color,
							})),
					),
				ctx.db
					.query("issues")
					.withSearchIndex("search_title", (q) =>
						q.search("title", term).eq("workspaceId", args.workspaceId),
					)
					.take(10)
					.then((results) =>
						results
							.filter((i) => {
								if (i.deletedAt) return false;
								if (accessibleProjectIds !== null) {
									const inAccessibleProject =
										i.projectId && accessibleProjectIds.has(i.projectId);
									return (
										inAccessibleProject ||
										i.assigneeId === userId ||
										i.createdBy === userId
									);
								}
								return true;
							})
							.slice(0, 5)
							.map((i) => ({
								_id: i._id,
								identifier: i.identifier,
								title: i.title,
								status: i.status,
								projectId: i.projectId,
							})),
					),
				ctx.db
					.query("stories")
					.withSearchIndex("search_title", (q) =>
						q.search("title", term).eq("workspaceId", args.workspaceId),
					)
					.take(10)
					.then((results) =>
						results
							.filter((s) => {
								if (s.deletedAt) return false;
								if (accessibleProjectIds !== null) {
									return !s.projectId || accessibleProjectIds.has(s.projectId);
								}
								return true;
							})
							.slice(0, 5)
							.map((s) => ({
								_id: s._id,
								identifier: s.identifier,
								title: s.title,
								status: s.status,
								projectId: s.projectId,
							})),
					),
				ctx.db
					.query("tasks")
					.withSearchIndex("search_title", (q) =>
						q.search("title", term).eq("workspaceId", args.workspaceId),
					)
					.take(10)
					.then((results) =>
						results
							.filter((t) => {
								if (t.deletedAt) return false;
								if (accessibleProjectIds !== null) {
									return !t.projectId || accessibleProjectIds.has(t.projectId);
								}
								return true;
							})
							.slice(0, 5)
							.map((t) => ({
								_id: t._id,
								identifier: t.identifier,
								title: t.title,
								status: t.status,
								projectId: t.projectId,
							})),
					),
				ctx.db
					.query("clients")
					.withSearchIndex("search_name", (q) =>
						q.search("name", term).eq("workspaceId", args.workspaceId),
					)
					.take(10)
					.then((results) =>
						results
							.filter((c) => {
								if (c.deletedAt) return false;
								if (accessibleClientIds !== null) {
									return (
										accessibleClientIds.has(c._id) || c.createdBy === userId
									);
								}
								return true;
							})
							.slice(0, 5)
							.map((c) => ({
								_id: c._id,
								name: c.name,
								status: c.status,
							})),
					),
				ctx.db
					.query("documents")
					.withSearchIndex("search_title", (q) =>
						q.search("title", term).eq("workspaceId", args.workspaceId),
					)
					.take(10)
					.then((results) =>
						results
							.filter((d) => {
								if (d.deletedAt) return false;
								if (accessibleProjectIds !== null) {
									if (d.projectId) return accessibleProjectIds.has(d.projectId);
									return d.createdBy === userId;
								}
								return true;
							})
							.slice(0, 5)
							.map((d) => ({
								_id: d._id,
								title: d.title,
								projectId: d.projectId,
							})),
					),
				ctx.db
					.query("whiteboards")
					.withSearchIndex("search_title", (q) =>
						q.search("title", term).eq("workspaceId", args.workspaceId),
					)
					.take(10)
					.then((results) =>
						results
							.filter((w) => {
								if (w.deletedAt) return false;
								if (accessibleProjectIds !== null) {
									if (w.projectId) return accessibleProjectIds.has(w.projectId);
									return w.createdBy === userId;
								}
								return true;
							})
							.slice(0, 5)
							.map((w) => ({
								_id: w._id,
								title: w.title,
								projectId: w.projectId,
							})),
					),
			]);

		return {
			projects,
			issues,
			stories,
			tasks,
			clients,
			documents,
			whiteboards,
		};
	},
});
