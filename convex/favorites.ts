import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

const DEFAULT_FAVORITES_LIMIT = 50;
const MAX_FAVORITES_LIMIT = 200;

const favoriteEntityTypeValidator = v.union(
	v.literal("project"),
	v.literal("story"),
	v.literal("client"),
	v.literal("document"),
	v.literal("whiteboard"),
	v.literal("issue"),
);

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
		limit: v.optional(v.number()),
	},
	returns: v.array(
		v.object({
			_id: v.id("favorites"),
			entityType: v.string(),
			entityId: v.string(),
			name: v.string(),
			icon: v.optional(v.string()),
			slug: v.optional(v.string()),
			sortOrder: v.optional(v.number()),
		}),
	),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const limit = Math.max(
			1,
			Math.min(args.limit ?? DEFAULT_FAVORITES_LIMIT, MAX_FAVORITES_LIMIT),
		);

		const favorites = await ctx.db
			.query("favorites")
			.withIndex("by_user_workspace", (q) =>
				q.eq("userId", userId).eq("workspaceId", args.workspaceId),
			)
			.order("desc")
			.take(limit);

		// Resolve entity names for display
		const resolved = await Promise.all(
			favorites.map(async (fav) => {
				let name = "Unknown";
				let icon: string | undefined;
				let slug: string | undefined;
				if (fav.entityType === "project") {
					const project = await ctx.db.get(
						fav.entityId as import("./_generated/dataModel").Id<"projects">,
					);
					name = project?.name || "Deleted project";
					icon = project?.icon;
					slug = project?.slug;
				} else if (fav.entityType === "client") {
					const client = await ctx.db.get(
						fav.entityId as import("./_generated/dataModel").Id<"clients">,
					);
					name = client?.name || "Deleted client";
				} else if (fav.entityType === "document") {
					const doc = await ctx.db.get(
						fav.entityId as import("./_generated/dataModel").Id<"documents">,
					);
					name = doc?.title || "Deleted document";
					icon = doc?.icon;
				} else if (fav.entityType === "whiteboard") {
					const board = await ctx.db.get(
						fav.entityId as import("./_generated/dataModel").Id<"whiteboards">,
					);
					name = board?.title || "Deleted whiteboard";
					icon = board?.icon;
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
					icon,
					slug,
					sortOrder: fav.sortOrder,
				};
			}),
		);

		return resolved.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
	},
});

export const hasAny = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const firstFavorite = await ctx.db
			.query("favorites")
			.withIndex("by_user_workspace", (q) =>
				q.eq("userId", userId).eq("workspaceId", args.workspaceId),
			)
			.first();
		return firstFavorite !== null;
	},
});

export const isFavorited = query({
	args: {
		workspaceId: v.id("workspaces"),
		entityType: favoriteEntityTypeValidator,
		entityId: v.string(),
	},
	returns: v.boolean(),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const existing = await ctx.db
			.query("favorites")
			.withIndex("by_user_entity", (q) =>
				q
					.eq("userId", userId)
					.eq("entityType", args.entityType)
					.eq("entityId", args.entityId),
			)
			.unique();
		return existing !== null && existing.workspaceId === args.workspaceId;
	},
});

export const toggle = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		entityType: favoriteEntityTypeValidator,
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

		// Sort order is append-only in current behavior; newest record carries the max.
		const lastFavorite = await ctx.db
			.query("favorites")
			.withIndex("by_user_workspace", (q) =>
				q.eq("userId", userId).eq("workspaceId", args.workspaceId),
			)
			.order("desc")
			.first();
		const maxSort = lastFavorite?.sortOrder ?? 0;

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
