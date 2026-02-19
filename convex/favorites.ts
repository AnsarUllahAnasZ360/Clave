import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(
		v.object({
			_id: v.id("favorites"),
			entityType: v.string(),
			entityId: v.string(),
			name: v.string(),
			sortOrder: v.optional(v.number()),
		}),
	),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const favorites = await ctx.db
			.query("favorites")
			.withIndex("by_user_workspace", (q) =>
				q.eq("userId", userId).eq("workspaceId", args.workspaceId),
			)
			.collect();

		// Resolve entity names for display
		const resolved = await Promise.all(
			favorites.map(async (fav) => {
				let name = "Unknown";
				if (fav.entityType === "project") {
					const project = await ctx.db.get(
						fav.entityId as import("./_generated/dataModel").Id<"projects">,
					);
					name = project?.name || "Deleted project";
				} else if (fav.entityType === "client") {
					const client = await ctx.db.get(
						fav.entityId as import("./_generated/dataModel").Id<"clients">,
					);
					name = client?.name || "Deleted client";
				} else if (fav.entityType === "note") {
					const note = await ctx.db.get(
						fav.entityId as import("./_generated/dataModel").Id<"notes">,
					);
					name = note?.title || "Untitled note";
				} else if (fav.entityType === "document") {
					const doc = await ctx.db.get(
						fav.entityId as import("./_generated/dataModel").Id<"documents">,
					);
					name = doc?.title || "Deleted document";
				} else if (fav.entityType === "whiteboard") {
					const board = await ctx.db.get(
						fav.entityId as import("./_generated/dataModel").Id<"whiteboards">,
					);
					name = board?.title || "Deleted whiteboard";
				} else if (fav.entityType === "issue") {
					const issue = await ctx.db.get(
						fav.entityId as import("./_generated/dataModel").Id<"issues">,
					);
					name = issue?.title || "Deleted issue";
				}
				return {
					_id: fav._id,
					entityType: fav.entityType,
					entityId: fav.entityId,
					name,
					sortOrder: fav.sortOrder,
				};
			}),
		);

		return resolved.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
	},
});

export const toggle = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		entityType: v.union(
			v.literal("project"),
			v.literal("story"),
			v.literal("note"),
			v.literal("client"),
			v.literal("document"),
			v.literal("whiteboard"),
			v.literal("issue"),
		),
		entityId: v.string(),
	},
	returns: v.object({
		action: v.union(v.literal("added"), v.literal("removed")),
	}),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		// Check if already favorited
		const existing = await ctx.db
			.query("favorites")
			.withIndex("by_user_entity", (q) =>
				q
					.eq("userId", userId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId),
			)
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
			return { action: "removed" as const };
		}

		// Get max sort order for new favorite
		const userFavorites = await ctx.db
			.query("favorites")
			.withIndex("by_user_workspace", (q) =>
				q.eq("userId", userId).eq("workspaceId", args.workspaceId),
			)
			.collect();
		const maxSort = userFavorites.reduce(
			(max, f) => Math.max(max, f.sortOrder ?? 0),
			0,
		);

		await ctx.db.insert("favorites", {
			userId,
			workspaceId: args.workspaceId,
			entityType: args.entityType,
			entityId: args.entityId,
			sortOrder: maxSort + 1,
		});
		return { action: "added" as const };
	},
});
