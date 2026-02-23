import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

const entityTypeValidator = v.union(
	v.literal("document"),
	v.literal("whiteboard"),
	v.literal("project"),
	v.literal("issue"),
	v.literal("aiChat"),
	v.literal("client"),
);

/**
 * Record an entity access. Upserts: updates accessedAt if the record
 * already exists, otherwise creates a new one.
 */
export const record = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		entityType: entityTypeValidator,
		entityId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const now = Date.now();

		// Check for existing record
		const existing = await ctx.db
			.query("recents")
			.withIndex("by_user_entity", (q) =>
				q.eq("userId", userId).eq("entityId", args.entityId),
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, { accessedAt: now });
		} else {
			await ctx.db.insert("recents", {
				userId,
				workspaceId: args.workspaceId,
				entityType: args.entityType,
				entityId: args.entityId,
				accessedAt: now,
			});
		}
		return null;
	},
});

/**
 * List the top 5 most recently accessed items for the current user
 * in the given workspace, with resolved entity names and icons.
 */
export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(
		v.object({
			_id: v.id("recents"),
			entityType: v.string(),
			entityId: v.string(),
			entitySlug: v.optional(v.string()),
			name: v.string(),
			icon: v.optional(v.string()),
			accessedAt: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const recents = await ctx.db
			.query("recents")
			.withIndex("by_user_workspace", (q) =>
				q.eq("userId", userId).eq("workspaceId", args.workspaceId),
			)
			.order("desc")
			.take(5);

		const resolved = await Promise.all(
			recents.map(async (recent) => {
				let name = "Unknown";
				let entitySlug: string | undefined;
				let icon: string | undefined;

				if (recent.entityType === "document") {
					const doc = await ctx.db.get(recent.entityId as Id<"documents">);
					name = doc?.title || "Deleted document";
					icon = doc?.icon;
				} else if (recent.entityType === "whiteboard") {
					const board = await ctx.db.get(recent.entityId as Id<"whiteboards">);
					name = board?.title || "Deleted whiteboard";
					icon = board?.icon;
				} else if (recent.entityType === "project") {
					const project = await ctx.db.get(recent.entityId as Id<"projects">);
					name = project?.name || "Deleted project";
					entitySlug = project?.slug;
					icon = project?.icon;
				} else if (recent.entityType === "issue") {
					const issue = await ctx.db.get(recent.entityId as Id<"issues">);
					name = issue?.title || "Deleted issue";
				} else if (recent.entityType === "aiChat") {
					const thread = await ctx.db.get(recent.entityId as Id<"aiThreads">);
					name = thread?.title || "AI Chat";
				} else if (recent.entityType === "client") {
					const client = await ctx.db.get(recent.entityId as Id<"clients">);
					name = client?.name || "Deleted client";
				}

				return {
					_id: recent._id,
					entityType: recent.entityType,
					entityId: recent.entityId,
					entitySlug,
					name,
					icon,
					accessedAt: recent.accessedAt,
				};
			}),
		);

		return resolved;
	},
});

/**
 * Clear all recent items for the current user in the given workspace.
 */
export const clear = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const recents = await ctx.db
			.query("recents")
			.withIndex("by_user_workspace", (q) =>
				q.eq("userId", userId).eq("workspaceId", args.workspaceId),
			)
			.collect();

		await Promise.all(recents.map((r) => ctx.db.delete(r._id)));
		return null;
	},
});
