import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";
import { requireAuth } from "./lib/auth";

const destinationSourceValidator = v.union(
	v.literal("lastActiveContext"),
	v.literal("recentMembership"),
	v.literal("onboarding"),
);

const destinationValidator = v.object({
	path: v.string(),
	source: destinationSourceValidator,
	workspaceId: v.optional(v.id("workspaces")),
});

const slashCommandValidator = v.object({
	id: v.string(),
	command: v.string(),
	title: v.string(),
	description: v.string(),
	content: v.string(),
	isShortcut: v.boolean(),
	createdAt: v.number(),
	updatedAt: v.number(),
	createdBy: v.optional(v.id("users")),
});

function toPath(workspaceSlug: string) {
	return `/${workspaceSlug}/chat`;
}

function byMostRecentJoinedAt<
	T extends { joinedAt: number; _creationTime: number },
>(a: T, b: T) {
	return b.joinedAt - a.joinedAt || b._creationTime - a._creationTime;
}

async function resolveWorkspaceDestination(
	ctx: QueryCtx,
	workspaceId: Id<"workspaces">,
) {
	const workspace = await ctx.db.get(workspaceId);
	if (!workspace || workspace.deletedAt) return null;

	return {
		path: toPath(workspace.slug),
		workspaceId: workspace._id,
	};
}

async function resolvePostLoginDestinationForUser(
	ctx: QueryCtx,
	user: {
		_id: Id<"users">;
		_creationTime: number;
		lastActiveWorkspaceId?: Id<"workspaces">;
	},
) {
	const workspaceMemberships = (
		await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect()
	).sort(byMostRecentJoinedAt);

	const workspaceMembershipIds = new Set(
		workspaceMemberships.map((m) => m.workspaceId),
	);

	if (
		user.lastActiveWorkspaceId &&
		workspaceMembershipIds.has(user.lastActiveWorkspaceId)
	) {
		const resolved = await resolveWorkspaceDestination(
			ctx,
			user.lastActiveWorkspaceId,
		);
		if (resolved) {
			return { ...resolved, source: "lastActiveContext" as const };
		}
	}

	for (const membership of workspaceMemberships) {
		const resolved = await resolveWorkspaceDestination(
			ctx,
			membership.workspaceId,
		);
		if (resolved) {
			return { ...resolved, source: "recentMembership" as const };
		}
	}

	return {
		path: "/onboarding",
		source: "onboarding" as const,
	};
}

/** Resolve post-login destination in one query using auth + destination state */
export const resolvePostLoginState = query({
	args: {},
	returns: v.object({
		isAuthenticated: v.boolean(),
		destination: v.union(destinationValidator, v.null()),
	}),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			return { isAuthenticated: false, destination: null };
		}

		const user = await ctx.db.get(userId);
		if (!user) {
			return { isAuthenticated: false, destination: null };
		}

		return {
			isAuthenticated: true,
			destination: await resolvePostLoginDestinationForUser(ctx, user),
		};
	},
});

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
			sidebarSections: v.optional(
				v.object({
					recents: v.optional(v.boolean()),
					favorites: v.optional(v.boolean()),
					projects: v.optional(v.boolean()),
				}),
			),
			notifyEmail: v.optional(v.boolean()),
			notifyPush: v.optional(v.boolean()),
			notifyInApp: v.optional(v.boolean()),
			notifyGoogleChat: v.optional(v.boolean()),
			aiAboutMe: v.optional(v.string()),
			aiHowToWorkWithMe: v.optional(v.string()),
			personalSlashCommands: v.optional(v.array(slashCommandValidator)),
			lastSeenVersion: v.optional(v.string()),
			lastActiveWorkspaceId: v.optional(v.id("workspaces")),
			lastActiveContextAt: v.optional(v.number()),
			suspended: v.optional(v.boolean()),
			isDemoUser: v.optional(v.boolean()),
			demoOnboardingDismissed: v.optional(v.boolean()),
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
		return {
			_id: user._id,
			_creationTime: user._creationTime,
			name: user.name,
			email: user.email,
			image: user.image,
			avatarStorageId: user.avatarStorageId,
			avatarUrl: avatarUrl ?? user.image,
			role: user.role,
			timezone: user.timezone,
			theme: user.theme,
			locale: user.locale,
			sidebarCollapsed: user.sidebarCollapsed,
			compactMode: user.compactMode,
			sidebarSections: user.sidebarSections,
			notifyEmail: user.notifyEmail,
			notifyPush: user.notifyPush,
			notifyInApp: user.notifyInApp,
			notifyGoogleChat: user.notifyGoogleChat,
			aiAboutMe: user.aiAboutMe,
			aiHowToWorkWithMe: user.aiHowToWorkWithMe,
			personalSlashCommands: user.personalSlashCommands,
			lastSeenVersion: user.lastSeenVersion,
			lastActiveWorkspaceId: user.lastActiveWorkspaceId,
			lastActiveContextAt: user.lastActiveContextAt,
			suspended: user.suspended,
			isDemoUser: user.isDemoUser,
			demoOnboardingDismissed: user.demoOnboardingDismissed,
		};
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
		await requireAuth(ctx);
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

/** Resolve post-login destination using last active context, then recent memberships */
export const resolvePostLoginDestination = query({
	args: {},
	returns: v.object({
		path: v.string(),
		source: destinationSourceValidator,
		workspaceId: v.optional(v.id("workspaces")),
	}),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("Not authenticated");
		}

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError("User not found");
		}
		return resolvePostLoginDestinationForUser(ctx, user);
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
		sidebarSections: v.optional(
			v.object({
				recents: v.optional(v.boolean()),
				favorites: v.optional(v.boolean()),
				projects: v.optional(v.boolean()),
			}),
		),
		notifyEmail: v.optional(v.boolean()),
		notifyPush: v.optional(v.boolean()),
		notifyInApp: v.optional(v.boolean()),
		notifyGoogleChat: v.optional(v.boolean()),
		aiAboutMe: v.optional(v.string()),
		aiHowToWorkWithMe: v.optional(v.string()),
		personalSlashCommands: v.optional(v.array(slashCommandValidator)),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("Not authenticated");
		}

		// Server-side profile validation
		if (args.name !== undefined) {
			const trimmed = args.name.trim();
			if (trimmed.length < 1 || trimmed.length > 100) {
				throw new ConvexError("Name must be between 1 and 100 characters");
			}
			args.name = trimmed;
		}
		if (args.aiAboutMe !== undefined && args.aiAboutMe.length > 2000) {
			throw new ConvexError("About me must be at most 2000 characters");
		}
		if (
			args.aiHowToWorkWithMe !== undefined &&
			args.aiHowToWorkWithMe.length > 2000
		) {
			throw new ConvexError(
				"How to work with me must be at most 2000 characters",
			);
		}
		if (
			args.personalSlashCommands !== undefined &&
			JSON.stringify(args.personalSlashCommands).length > 5000
		) {
			throw new ConvexError(
				"Personal slash commands must be at most 5000 characters",
			);
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

/** Persist the authenticated user's active workspace context */
export const setActiveContext = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("Not authenticated");
		}

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError("User not found");
		}

		// Early return: skip all validation reads if context hasn't changed
		if (user.lastActiveWorkspaceId === args.workspaceId) {
			return null;
		}

		const workspaceMembership = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("userId", userId),
			)
			.unique();
		if (!workspaceMembership) {
			throw new ConvexError("Not a workspace member");
		}

		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace || workspace.deletedAt) {
			throw new ConvexError("Workspace not found");
		}

		await ctx.db.patch(userId, {
			lastActiveContextAt: Date.now(),
			lastActiveWorkspaceId: args.workspaceId,
		});
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

/** Soft-delete the authenticated user's account */
export const deleteAccount = mutation({
	args: {},
	returns: v.object({ success: v.boolean() }),
	handler: async (ctx) => {
		const userId = await requireAuth(ctx);

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError("User not found");
		}

		// Soft-delete user: anonymize profile
		await ctx.db.patch(userId, {
			deletedAt: Date.now(),
			name: "Deleted User",
			email: `deleted_${userId}@deleted.clave.app`,
			image: undefined,
			avatarStorageId: undefined,
			aiAboutMe: undefined,
			aiHowToWorkWithMe: undefined,
			personalSlashCommands: undefined,
		});

		// Remove from all workspace memberships
		const workspaceMemberships = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		for (const membership of workspaceMemberships) {
			await ctx.db.delete(membership._id);
		}

		return { success: true };
	},
});
