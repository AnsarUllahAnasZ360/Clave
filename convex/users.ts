import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";

/** Return the authenticated user's full profile */
export const current = query({
	args: {},
	returns: v.union(
		v.object({
			_id: v.id("users"),
			_creationTime: v.number(),
			name: v.optional(v.string()),
			email: v.optional(v.string()),
			image: v.optional(v.string()),
			avatarStorageId: v.optional(v.id("_storage")),
			avatarUrl: v.optional(v.string()),
			role: v.optional(v.string()),
			timezone: v.optional(v.string()),
			theme: v.optional(
				v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
			),
			locale: v.optional(v.string()),
			sidebarCollapsed: v.optional(v.boolean()),
			compactMode: v.optional(v.boolean()),
			notifyEmail: v.optional(v.boolean()),
			notifyPush: v.optional(v.boolean()),
			notifyInApp: v.optional(v.boolean()),
		}),
		v.null(),
	),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return null;
		const user = await ctx.db.get(userId);
		if (!user) return null;
		let avatarUrl: string | undefined;
		if (user.avatarStorageId) {
			const url = await ctx.storage.getUrl(user.avatarStorageId);
			if (url) avatarUrl = url;
		}
		return { ...user, avatarUrl: avatarUrl ?? user.image };
	},
});

/** Return a user by ID (for displaying other users' names/avatars) */
export const getById = query({
	args: { userId: v.id("users") },
	returns: v.union(
		v.object({
			_id: v.id("users"),
			_creationTime: v.number(),
			name: v.optional(v.string()),
			email: v.optional(v.string()),
			image: v.optional(v.string()),
			avatarStorageId: v.optional(v.id("_storage")),
			avatarUrl: v.optional(v.string()),
			role: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const user = await ctx.db.get(args.userId);
		if (!user) return null;
		let avatarUrl: string | undefined;
		if (user.avatarStorageId) {
			const url = await ctx.storage.getUrl(user.avatarStorageId);
			if (url) avatarUrl = url;
		}
		return {
			_id: user._id,
			_creationTime: user._creationTime,
			name: user.name,
			email: user.email,
			image: user.image,
			avatarStorageId: user.avatarStorageId,
			avatarUrl: avatarUrl ?? user.image,
			role: user.role,
		};
	},
});

/** Update the authenticated user's profile fields */
export const update = mutation({
	args: {
		name: v.optional(v.string()),
		role: v.optional(v.string()),
		timezone: v.optional(v.string()),
		theme: v.optional(
			v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
		),
		locale: v.optional(v.string()),
		sidebarCollapsed: v.optional(v.boolean()),
		compactMode: v.optional(v.boolean()),
		notifyEmail: v.optional(v.boolean()),
		notifyPush: v.optional(v.boolean()),
		notifyInApp: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("Not authenticated");
		}

		// Build patch object from provided fields only
		const patch: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(args)) {
			if (value !== undefined) {
				patch[key] = value;
			}
		}

		if (Object.keys(patch).length > 0) {
			await ctx.db.patch(userId, patch);
		}

		return null;
	},
});

/** Generate an upload URL for avatar upload */
export const generateAvatarUploadUrl = mutation({
	args: {},
	returns: v.string(),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Not authenticated");
		return await ctx.storage.generateUploadUrl();
	},
});

/** Save the uploaded avatar storage ID to the user's profile */
export const saveAvatar = mutation({
	args: {
		storageId: v.id("_storage"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) throw new ConvexError("Not authenticated");
		await ctx.db.patch(userId, { avatarStorageId: args.storageId });
		return null;
	},
});

/** Get the avatar URL for the current user */
export const getAvatarUrl = query({
	args: {},
	returns: v.union(v.string(), v.null()),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) return null;
		const user = await ctx.db.get(userId);
		if (!user?.avatarStorageId) return null;
		return await ctx.storage.getUrl(user.avatarStorageId);
	},
});
