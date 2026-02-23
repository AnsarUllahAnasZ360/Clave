import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

/** Check if user is admin, project creator, or project lead */
async function requireProjectManageAccess(
	ctx: QueryCtx | MutationCtx,
	project: {
		workspaceId: Id<"workspaces">;
		createdBy: Id<"users">;
		leadId?: Id<"users">;
	},
) {
	const { userId, member } = await requireWorkspaceMember(
		ctx,
		project.workspaceId,
	);
	if (
		member.role !== "admin" &&
		project.createdBy !== userId &&
		project.leadId !== userId
	) {
		throw new ConvexError(
			"Only admins, project creators, or project leads can manage members",
		);
	}
	return { userId, member };
}

export const list = query({
	args: {
		projectId: v.id("projects"),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) return [];
		await requireWorkspaceMember(ctx, project.workspaceId);

		const members = await ctx.db
			.query("projectMembers")
			.withIndex("by_project", (q) => q.eq("projectId", args.projectId))
			.collect();

		const membersWithProfiles = await Promise.all(
			members.map(async (m) => {
				const user = await ctx.db.get(m.userId);
				let avatarUrl: string | null = null;
				if (user?.avatarStorageId) {
					const url = await ctx.storage.getUrl(user.avatarStorageId);
					if (url) avatarUrl = url;
				}
				return {
					_id: m._id,
					userId: m.userId,
					role: m.role,
					addedAt: m.addedAt,
					name: user?.name ?? null,
					email: user?.email ?? null,
					image: avatarUrl ?? user?.image ?? null,
				};
			}),
		);

		return membersWithProfiles;
	},
});

export const add = mutation({
	args: {
		projectId: v.id("projects"),
		userId: v.id("users"),
		role: v.union(
			v.literal("owner"),
			v.literal("contributor"),
			v.literal("stakeholder"),
		),
	},
	handler: async (ctx, args) => {
		const project = await ctx.db.get(args.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireProjectManageAccess(ctx, project);

		// Check if already a member
		const existing = await ctx.db
			.query("projectMembers")
			.withIndex("by_project_user", (q) =>
				q.eq("projectId", args.projectId).eq("userId", args.userId),
			)
			.unique();

		if (existing) {
			throw new ConvexError("User is already a project member");
		}

		return await ctx.db.insert("projectMembers", {
			projectId: args.projectId,
			userId: args.userId,
			role: args.role,
			addedAt: Date.now(),
		});
	},
});

export const remove = mutation({
	args: {
		memberId: v.id("projectMembers"),
	},
	handler: async (ctx, args) => {
		const member = await ctx.db.get(args.memberId);
		if (!member) {
			throw new ConvexError("Project member not found");
		}

		const project = await ctx.db.get(member.projectId);
		if (!project || project.deletedAt) {
			throw new ConvexError("Project not found");
		}
		await requireProjectManageAccess(ctx, project);

		await ctx.db.delete(args.memberId);
	},
});
