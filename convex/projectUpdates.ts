import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";
import { notifyUsers } from "./lib/notifications";

// ── Queries ────────────────────────────────────────────────────────────────

/** List project updates, newest first */
export const listByProject = query({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];
		await requireWorkspaceMember(ctx, project.workspaceId);

		const updates = await ctx.db
			.query("projectUpdates")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		// Enrich with author info, sort newest first
		const enriched = await Promise.all(
			updates.map(async (update) => {
				const author = await ctx.db.get(update.createdBy);
				return {
					...update,
					authorName: author?.name ?? "Unknown",
					authorImage:
						(author?.avatarStorageId
							? await ctx.storage.getUrl(author.avatarStorageId)
							: null) ?? author?.image,
				};
			}),
		);

		enriched.sort((a, b) => b._creationTime - a._creationTime);
		return enriched;
	},
});

// ── Mutations ──────────────────────────────────────────────────────────────

/** Create a project status update */
export const create = mutation({
	args: {
		projectId: v.id("projects"),
		health: v.union(
			v.literal("on_track"),
			v.literal("at_risk"),
			v.literal("off_track"),
		),
		body: v.string(),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		const { userId } = await requireWorkspaceMember(ctx, project.workspaceId);

		const updateId = await ctx.db.insert("projectUpdates", {
			projectId: args.projectId,
			health: args.health,
			body: args.body,
			createdBy: userId,
		});

		// Notify all project members about the status update
		const members = await ctx.db
			.query("projectMembers")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		const memberUserIds = members.map((m) => m.userId);
		const actor = await ctx.db.get(userId);
		const actorName = actor?.name ?? "Someone";
		const healthLabel = args.health.replace(/_/g, " ");

		await notifyUsers(ctx, memberUserIds, {
			workspaceId: project.workspaceId,
			type: "project_update",
			title: "Project status update",
			body: `${actorName} posted a ${healthLabel} update on '${project.name}'`,
			projectId: args.projectId,
			actorId: userId,
		});

		return updateId;
	},
});
