import { getAuthUserId } from "@convex-dev/auth/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { QueryCtx } from "./_generated/server";
import { mutation, query } from "./_generated/server";

const destinationSourceValidator = v.union(
	v.literal("lastActiveContext"),
	v.literal("recentMembership"),
	v.literal("onboarding"),
);

const destinationValidator = v.object({
	path: v.string(),
	source: destinationSourceValidator,
	organizationId: v.optional(v.id("organizations")),
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

function toPath(orgSlug: string, workspaceSlug: string) {
	return `/${orgSlug}/${workspaceSlug}/chat`;
}

function byMostRecentJoinedAt<
	T extends { joinedAt: number; _creationTime: number },
>(a: T, b: T) {
	return b.joinedAt - a.joinedAt || b._creationTime - a._creationTime;
}

async function resolveWorkspaceDestination(
	ctx: QueryCtx,
	workspaceId: Id<"workspaces">,
	organizationMembershipIds: Set<Id<"organizations">>,
	organizationFallbackIds: Id<"organizations">[],
	preferredOrganizationId?: Id<"organizations">,
) {
	const workspace = await ctx.db.get(workspaceId);
	if (!workspace || workspace.deletedAt) return null;

	let organizationId = workspace.organizationId;

	// Legacy fallback: allow orphan workspaces (no organizationId) to pair
	// with the user's preferred/recent organization membership.
	if (!organizationId) {
		if (
			preferredOrganizationId &&
			organizationMembershipIds.has(preferredOrganizationId)
		) {
			organizationId = preferredOrganizationId;
		} else {
			organizationId = organizationFallbackIds[0];
		}
	}

	if (!organizationId || !organizationMembershipIds.has(organizationId))
		return null;

	const organization = await ctx.db.get(organizationId);
	if (!organization || organization.deletedAt) return null;

	return {
		path: toPath(organization.slug, workspace.slug),
		organizationId: organization._id,
		workspaceId: workspace._id,
	};
}

async function resolvePostLoginDestinationForUser(
	ctx: QueryCtx,
	user: {
		_id: Id<"users">;
		_creationTime: number;
		lastActiveWorkspaceId?: Id<"workspaces">;
		lastActiveOrganizationId?: Id<"organizations">;
	},
) {
	const orgMemberships = (
		await ctx.db
			.query("organizationMembers")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect()
	).sort(byMostRecentJoinedAt);

	const workspaceMemberships = (
		await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.collect()
	).sort(byMostRecentJoinedAt);

	const organizationMembershipIds = new Set(
		orgMemberships.map((m) => m.organizationId),
	);
	const organizationFallbackIds = orgMemberships.map((m) => m.organizationId);
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
			organizationMembershipIds,
			organizationFallbackIds,
			user.lastActiveOrganizationId,
		);
		if (resolved) {
			return { ...resolved, source: "lastActiveContext" as const };
		}
	}

	for (const membership of workspaceMemberships) {
		const resolved = await resolveWorkspaceDestination(
			ctx,
			membership.workspaceId,
			organizationMembershipIds,
			organizationFallbackIds,
			user.lastActiveOrganizationId,
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
			aiAboutMe: v.optional(v.string()),
			aiHowToWorkWithMe: v.optional(v.string()),
			personalSlashCommands: v.optional(v.array(slashCommandValidator)),
			lastSeenVersion: v.optional(v.string()),
			lastActiveOrganizationId: v.optional(v.id("organizations")),
			lastActiveWorkspaceId: v.optional(v.id("workspaces")),
			lastActiveContextAt: v.optional(v.number()),
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

/** Resolve post-login destination using last active context, then recent memberships */
export const resolvePostLoginDestination = query({
	args: {},
	returns: v.object({
		path: v.string(),
		source: destinationSourceValidator,
		organizationId: v.optional(v.id("organizations")),
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

/** Persist the authenticated user's active organization/workspace context */
export const setActiveContext = mutation({
	args: {
		organizationId: v.optional(v.id("organizations")),
		workspaceId: v.optional(v.id("workspaces")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		if (!userId) {
			throw new ConvexError("Not authenticated");
		}

		if (args.organizationId === undefined && args.workspaceId === undefined) {
			throw new ConvexError(
				"At least one of organizationId or workspaceId is required",
			);
		}

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError("User not found");
		}

		// Early return: skip all validation reads if context hasn't changed
		if (
			user.lastActiveOrganizationId === args.organizationId &&
			user.lastActiveWorkspaceId === args.workspaceId
		) {
			return null;
		}

		let resolvedOrganizationId = args.organizationId;

		if (resolvedOrganizationId !== undefined) {
			const organizationId = resolvedOrganizationId;
			const orgMembership = await ctx.db
				.query("organizationMembers")
				.withIndex("by_org_user", (q) =>
					q.eq("organizationId", organizationId).eq("userId", userId),
				)
				.unique();
			if (!orgMembership) {
				throw new ConvexError("Not an organization member");
			}

			const organization = await ctx.db.get(organizationId);
			if (!organization || organization.deletedAt) {
				throw new ConvexError("Organization not found");
			}
		}

		if (args.workspaceId !== undefined) {
			const workspaceId = args.workspaceId;
			const workspaceMembership = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace_user", (q) =>
					q.eq("workspaceId", workspaceId).eq("userId", userId),
				)
				.unique();
			if (!workspaceMembership) {
				throw new ConvexError("Not a workspace member");
			}

			const workspace = await ctx.db.get(workspaceId);
			if (!workspace || workspace.deletedAt) {
				throw new ConvexError("Workspace not found");
			}

			if (workspace.organizationId) {
				if (
					resolvedOrganizationId &&
					resolvedOrganizationId !== workspace.organizationId
				) {
					throw new ConvexError(
						"workspaceId does not belong to the provided organizationId",
					);
				}
				resolvedOrganizationId = workspace.organizationId;
			}
		}

		const patch: {
			lastActiveContextAt: number;
			lastActiveOrganizationId?: Id<"organizations">;
			lastActiveWorkspaceId?: Id<"workspaces">;
		} = {
			lastActiveContextAt: Date.now(),
		};

		if (resolvedOrganizationId !== undefined) {
			patch.lastActiveOrganizationId = resolvedOrganizationId;
		}
		if (args.workspaceId !== undefined) {
			patch.lastActiveWorkspaceId = args.workspaceId;
		}

		await ctx.db.patch(userId, patch);
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
