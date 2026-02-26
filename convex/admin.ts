import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import {
	internalMutation,
	type MutationCtx,
	mutation,
	query,
} from "./_generated/server";
import { requireSuperAdmin } from "./lib/auth";

const MS_PER_DAY = 86400000;

function dayBucket(timestamp: number): string {
	const dayNumber = Math.floor(timestamp / MS_PER_DAY);
	return new Date(dayNumber * MS_PER_DAY).toISOString().slice(0, 10);
}

function workspacePath(orgSlug: string, workspaceSlug: string) {
	return `/${orgSlug}/${workspaceSlug}/projects`;
}

async function ensureAdminOrganizationMembership(
	ctx: MutationCtx,
	organizationId: Id<"organizations">,
	userId: Id<"users">,
) {
	const membership = await ctx.db
		.query("organizationMembers")
		.withIndex("by_org_user", (q) =>
			q.eq("organizationId", organizationId).eq("userId", userId),
		)
		.unique();

	if (membership) {
		if (membership.role !== "owner" && membership.role !== "admin") {
			await ctx.db.patch(membership._id, { role: "admin" });
		}
		return;
	}

	await ctx.db.insert("organizationMembers", {
		organizationId,
		userId,
		role: "admin",
		joinedAt: Date.now(),
		invitedBy: userId,
	});
}

async function ensureAdminWorkspaceMembership(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
	userId: Id<"users">,
) {
	const membership = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace_user", (q) =>
			q.eq("workspaceId", workspaceId).eq("userId", userId),
		)
		.unique();

	if (membership) {
		if (membership.role !== "admin") {
			await ctx.db.patch(membership._id, { role: "admin" });
		}
		return;
	}

	await ctx.db.insert("workspaceMembers", {
		workspaceId,
		userId,
		role: "admin",
		joinedAt: Date.now(),
	});
}

async function openOrganizationPathForAdmin(
	ctx: MutationCtx,
	callerId: Id<"users">,
	organizationId: Id<"organizations">,
	preferredWorkspaceId?: Id<"workspaces">,
) {
	const organization = await ctx.db.get(organizationId);
	if (!organization || organization.deletedAt) {
		throw new ConvexError("Organization not found");
	}

	await ensureAdminOrganizationMembership(ctx, organization._id, callerId);

	const workspaceRecords = await ctx.db
		.query("workspaces")
		.withIndex("by_organization", (q) =>
			q.eq("organizationId", organization._id),
		)
		.collect();
	const workspaces = workspaceRecords
		.filter((workspace) => !workspace.deletedAt)
		.sort(
			(a, b) =>
				(b.updatedAt ?? b._creationTime) - (a.updatedAt ?? a._creationTime),
		);

	for (const workspace of workspaces) {
		await ensureAdminWorkspaceMembership(ctx, workspace._id, callerId);
	}

	let workspace =
		preferredWorkspaceId !== undefined
			? workspaces.find((item) => item._id === preferredWorkspaceId)
			: undefined;
	if (!workspace) workspace = workspaces[0];

	await ctx.db.patch(callerId, {
		lastActiveContextAt: Date.now(),
		lastActiveOrganizationId: organization._id,
		lastActiveWorkspaceId: workspace?._id,
	});

	return {
		organizationId: organization._id,
		workspaceId: workspace?._id,
		path: workspace
			? workspacePath(organization.slug, workspace.slug)
			: `/organizations/${organization.slug}`,
	};
}

/** Platform-wide statistics for the admin dashboard */
export const getStats = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const allUsers = await ctx.db.query("users").collect();
		const totalUsers = allUsers.length;
		const activeUserIds = new Set(
			allUsers.filter((user) => !user.suspended).map((user) => user._id),
		);

		const allOrganizations = await ctx.db.query("organizations").collect();
		const totalOrganizations = allOrganizations.filter(
			(organization) => !organization.deletedAt,
		).length;

		const allWorkspaces = await ctx.db.query("workspaces").collect();
		const totalWorkspaces = allWorkspaces.filter(
			(workspace) => !workspace.deletedAt,
		).length;

		// Active users in the last 24 hours via workspacePresence.
		const cutoff = Date.now() - 86400000;
		const presenceRecords = await ctx.db.query("workspacePresence").collect();
		const activeUsers24h = new Set(
			presenceRecords
				.filter(
					(presence) =>
						presence.lastActiveAt > cutoff &&
						activeUserIds.has(presence.userId),
				)
				.map((presence) => presence.userId),
		).size;

		return {
			totalUsers,
			totalOrganizations,
			totalWorkspaces,
			activeUsers24h,
		};
	},
});

/** Recent activity: last 10 user signups + last 10 org creations */
export const getRecentActivity = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const recentUsers = await ctx.db.query("users").order("desc").take(10);
		const recentOrgs = await ctx.db
			.query("organizations")
			.order("desc")
			.take(10);

		const userActivity = recentUsers.map((user) => ({
			type: "user_signup" as const,
			id: user._id,
			name: user.name ?? user.email ?? "Unknown",
			email: user.email,
			timestamp: user._creationTime,
		}));

		const orgActivity = recentOrgs
			.filter((organization) => !organization.deletedAt)
			.map((organization) => ({
				type: "org_created" as const,
				id: organization._id,
				name: organization.name,
				slug: organization.slug,
				timestamp: organization._creationTime,
			}));

		// Merge and sort by timestamp descending.
		const combined = [...userActivity, ...orgActivity].sort(
			(a, b) => b.timestamp - a.timestamp,
		);

		return combined.slice(0, 15);
	},
});

/** Internal-only mutation to promote a user to superadmin by email */
export const setSuperAdmin = internalMutation({
	args: { email: v.string() },
	handler: async (ctx, { email }) => {
		const user = await ctx.db
			.query("users")
			.withIndex("email", (q) => q.eq("email", email))
			.unique();
		if (!user) {
			throw new Error(`User with email "${email}" not found`);
		}
		await ctx.db.patch(user._id, { role: "superadmin" });
		return { success: true, userId: user._id };
	},
});

// ── Organizations Management ─────────────────────────────────────────────

/** List all non-deleted organizations with enriched data for admin table */
export const listOrganizations = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const orgs = await ctx.db.query("organizations").collect();
		const activeOrgs = orgs.filter((organization) => !organization.deletedAt);

		const enriched = await Promise.all(
			activeOrgs.map(async (org) => {
				const owner = await ctx.db.get(org.ownerId);

				const members = await ctx.db
					.query("organizationMembers")
					.withIndex("by_org", (q) => q.eq("organizationId", org._id))
					.collect();

				const workspaces = await ctx.db
					.query("workspaces")
					.withIndex("by_organization", (q) => q.eq("organizationId", org._id))
					.collect();
				const activeWorkspaces = workspaces.filter(
					(workspace) => !workspace.deletedAt,
				);

				return {
					_id: org._id,
					name: org.name,
					slug: org.slug,
					plan: org.plan ?? "free",
					suspended: org.suspended ?? false,
					createdAt: org.createdAt ?? org._creationTime,
					owner: {
						name: owner?.name ?? "Unknown",
						email: owner?.email ?? "",
					},
					memberCount: members.length,
					workspaceCount: activeWorkspaces.length,
				};
			}),
		);

		return enriched.sort((a, b) => b.createdAt - a.createdAt);
	},
});

/** Full organization detail with members and workspaces lists */
export const getOrganizationDetail = query({
	args: { organizationId: v.id("organizations") },
	handler: async (ctx, { organizationId }) => {
		await requireSuperAdmin(ctx);

		const org = await ctx.db.get(organizationId);
		if (!org || org.deletedAt) {
			throw new ConvexError("Organization not found");
		}

		const owner = await ctx.db.get(org.ownerId);

		const memberRecords = await ctx.db
			.query("organizationMembers")
			.withIndex("by_org", (q) => q.eq("organizationId", organizationId))
			.collect();

		const members = await Promise.all(
			memberRecords.map(async (member) => {
				const user = await ctx.db.get(member.userId);
				return {
					userId: member.userId,
					name: user?.name ?? "Unknown",
					email: user?.email ?? "",
					image: user?.image,
					role: member.role,
				};
			}),
		);

		const workspaceRecords = await ctx.db
			.query("workspaces")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.collect();

		const workspaces = await Promise.all(
			workspaceRecords
				.filter((workspace) => !workspace.deletedAt)
				.map(async (workspace) => {
					const workspaceMembers = await ctx.db
						.query("workspaceMembers")
						.withIndex("by_workspace", (q) =>
							q.eq("workspaceId", workspace._id),
						)
						.collect();
					return {
						_id: workspace._id,
						name: workspace.name,
						slug: workspace.slug,
						memberCount: workspaceMembers.length,
					};
				}),
		);

		return {
			_id: org._id,
			name: org.name,
			slug: org.slug,
			plan: org.plan ?? "free",
			suspended: org.suspended ?? false,
			createdAt: org.createdAt ?? org._creationTime,
			description: org.description,
			owner: {
				_id: org.ownerId,
				name: owner?.name ?? "Unknown",
				email: owner?.email ?? "",
			},
			members,
			workspaces,
		};
	},
});

/** Suspend an organization (superadmin only) */
export const suspendOrganization = mutation({
	args: { organizationId: v.id("organizations") },
	handler: async (ctx, { organizationId }) => {
		await requireSuperAdmin(ctx);
		const org = await ctx.db.get(organizationId);
		if (!org || org.deletedAt) {
			throw new ConvexError("Organization not found");
		}
		await ctx.db.patch(organizationId, { suspended: true });
	},
});

/** Unsuspend an organization (superadmin only) */
export const unsuspendOrganization = mutation({
	args: { organizationId: v.id("organizations") },
	handler: async (ctx, { organizationId }) => {
		await requireSuperAdmin(ctx);
		const org = await ctx.db.get(organizationId);
		if (!org || org.deletedAt) {
			throw new ConvexError("Organization not found");
		}
		await ctx.db.patch(organizationId, { suspended: false });
	},
});

/** Change an organization's plan (superadmin only) */
export const updateOrganizationPlan = mutation({
	args: {
		organizationId: v.id("organizations"),
		plan: v.union(v.literal("free"), v.literal("pro"), v.literal("enterprise")),
	},
	handler: async (ctx, { organizationId, plan }) => {
		await requireSuperAdmin(ctx);
		const org = await ctx.db.get(organizationId);
		if (!org || org.deletedAt) {
			throw new ConvexError("Organization not found");
		}
		await ctx.db.patch(organizationId, { plan });
	},
});

/** Open an organization/workspace path as superadmin with managed access. */
export const openOrganizationContext = mutation({
	args: {
		organizationId: v.id("organizations"),
		preferredWorkspaceId: v.optional(v.id("workspaces")),
	},
	handler: async (ctx, { organizationId, preferredWorkspaceId }) => {
		const callerId = await requireSuperAdmin(ctx);
		return await openOrganizationPathForAdmin(
			ctx,
			callerId,
			organizationId,
			preferredWorkspaceId,
		);
	},
});

// ── Users Management ──────────────────────────────────────────────────────

/** List all users with enriched data for admin table */
export const listUsers = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const users = await ctx.db.query("users").collect();
		const allOrgMembers = await ctx.db.query("organizationMembers").collect();
		const allWsMembers = await ctx.db.query("workspaceMembers").collect();
		const allPresence = await ctx.db.query("workspacePresence").collect();

		const orgCountByUser = new Map<string, number>();
		for (const membership of allOrgMembers) {
			orgCountByUser.set(
				membership.userId,
				(orgCountByUser.get(membership.userId) ?? 0) + 1,
			);
		}

		const wsCountByUser = new Map<string, number>();
		for (const membership of allWsMembers) {
			wsCountByUser.set(
				membership.userId,
				(wsCountByUser.get(membership.userId) ?? 0) + 1,
			);
		}

		const lastActiveByUser = new Map<string, number>();
		for (const presence of allPresence) {
			const current = lastActiveByUser.get(presence.userId) ?? 0;
			if (presence.lastActiveAt > current) {
				lastActiveByUser.set(presence.userId, presence.lastActiveAt);
			}
		}

		return [...users]
			.sort((a, b) => b._creationTime - a._creationTime)
			.map((user) => ({
				_id: user._id,
				name: user.name ?? null,
				email: user.email ?? null,
				image: user.image ?? null,
				role: user.role ?? null,
				suspended: user.suspended ?? false,
				createdAt: user._creationTime,
				orgCount: orgCountByUser.get(user._id) ?? 0,
				workspaceCount: wsCountByUser.get(user._id) ?? 0,
				lastActiveAt: lastActiveByUser.get(user._id) ?? null,
			}));
	},
});

/** Full user detail with organization and workspace memberships */
export const getUserDetail = query({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		await requireSuperAdmin(ctx);

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError("User not found");
		}

		const orgMemberships = await ctx.db
			.query("organizationMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		const organizations = await Promise.all(
			orgMemberships.map(async (membership) => {
				const org = await ctx.db.get(membership.organizationId);
				return {
					_id: membership.organizationId,
					name: org?.name ?? "Unknown",
					slug: org?.slug ?? "",
					role: membership.role,
				};
			}),
		);

		const workspaceMemberships = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();

		const workspaces = await Promise.all(
			workspaceMemberships.map(async (membership) => {
				const workspace = await ctx.db.get(membership.workspaceId);
				return {
					_id: membership.workspaceId,
					name: workspace?.name ?? "Unknown",
					slug: workspace?.slug ?? "",
					role: membership.role,
				};
			}),
		);

		const presenceRecords = await ctx.db
			.query("workspacePresence")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		let lastActiveAt: number | null = null;
		for (const presence of presenceRecords) {
			if (lastActiveAt === null || presence.lastActiveAt > lastActiveAt) {
				lastActiveAt = presence.lastActiveAt;
			}
		}

		return {
			_id: user._id,
			name: user.name ?? null,
			email: user.email ?? null,
			image: user.image ?? null,
			role: user.role ?? null,
			suspended: user.suspended ?? false,
			createdAt: user._creationTime,
			lastActiveAt,
			organizations,
			workspaces,
		};
	},
});

/** Suspend a user (superadmin only). Cannot suspend self. */
export const suspendUser = mutation({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		const callerId = await requireSuperAdmin(ctx);
		if (userId === callerId) {
			throw new ConvexError("Cannot suspend your own account");
		}
		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError("User not found");
		}
		await ctx.db.patch(userId, { suspended: true });
	},
});

/** Unsuspend a user (superadmin only) */
export const unsuspendUser = mutation({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		await requireSuperAdmin(ctx);
		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError("User not found");
		}
		await ctx.db.patch(userId, { suspended: false });
	},
});

/** Update a user's platform role (superadmin only). Safety guards for last-superadmin and suspended users. */
export const updateUserRole = mutation({
	args: {
		userId: v.id("users"),
		role: v.union(v.literal("superadmin"), v.null()),
	},
	handler: async (ctx, { userId, role }) => {
		const callerId = await requireSuperAdmin(ctx);
		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError("User not found");
		}

		if (role === "superadmin" && user.suspended) {
			throw new ConvexError("Cannot promote a suspended user to superadmin");
		}

		if (role === null && userId === callerId) {
			const allUsers = await ctx.db.query("users").collect();
			const superadminCount = allUsers.filter(
				(entry) => entry.role === "superadmin",
			).length;
			if (superadminCount <= 1) {
				throw new ConvexError(
					"Cannot remove the last superadmin from the platform",
				);
			}
		}

		await ctx.db.patch(userId, {
			role: role === null ? undefined : role,
		});
	},
});

/** Update a user's profile basics (superadmin only). */
export const updateUserProfile = mutation({
	args: {
		userId: v.id("users"),
		name: v.optional(v.string()),
	},
	handler: async (ctx, { userId, name }) => {
		await requireSuperAdmin(ctx);

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError("User not found");
		}

		if (name === undefined) {
			throw new ConvexError("No changes provided");
		}

		const trimmedName = name.trim();
		await ctx.db.patch(userId, {
			name: trimmedName.length > 0 ? trimmedName : undefined,
		});
	},
});

/** Deactivate a user and remove memberships (superadmin only). */
export const removeUser = mutation({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		const callerId = await requireSuperAdmin(ctx);
		if (callerId === userId) {
			throw new ConvexError("Cannot remove your own account");
		}

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError("User not found");
		}

		if (user.role === "superadmin") {
			const allUsers = await ctx.db.query("users").collect();
			const superadminCount = allUsers.filter(
				(entry) => entry.role === "superadmin",
			).length;
			if (superadminCount <= 1) {
				throw new ConvexError("Cannot remove the last superadmin");
			}
		}

		const ownedOrganizations = await ctx.db
			.query("organizations")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.collect();
		if (ownedOrganizations.some((organization) => !organization.deletedAt)) {
			throw new ConvexError(
				"User owns active organizations. Transfer ownership before removal.",
			);
		}

		const ownedWorkspaces = await ctx.db
			.query("workspaces")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.collect();
		if (ownedWorkspaces.some((workspace) => !workspace.deletedAt)) {
			throw new ConvexError(
				"User owns active workspaces. Transfer ownership before removal.",
			);
		}

		const organizationMemberships = await ctx.db
			.query("organizationMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		for (const membership of organizationMemberships) {
			await ctx.db.delete(membership._id);
		}

		const workspaceMemberships = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		for (const membership of workspaceMemberships) {
			await ctx.db.delete(membership._id);
		}

		const projectMemberships = await ctx.db
			.query("projectMembers")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		for (const membership of projectMemberships) {
			await ctx.db.delete(membership._id);
		}

		const issueSubscriptions = await ctx.db
			.query("issueSubscriptions")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		for (const subscription of issueSubscriptions) {
			await ctx.db.delete(subscription._id);
		}

		const presenceRecords = await ctx.db
			.query("workspacePresence")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.collect();
		for (const presence of presenceRecords) {
			await ctx.db.delete(presence._id);
		}

		await ctx.db.patch(userId, {
			suspended: true,
			role: undefined,
			image: undefined,
			avatarStorageId: undefined,
			lastActiveOrganizationId: undefined,
			lastActiveWorkspaceId: undefined,
			lastActiveContextAt: Date.now(),
		});
	},
});

/** Open a target user's organization/workspace context as superadmin. */
export const openUserContext = mutation({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		const callerId = await requireSuperAdmin(ctx);
		const targetUser = await ctx.db.get(userId);
		if (!targetUser) {
			throw new ConvexError("User not found");
		}

		const workspaceMemberships = (
			await ctx.db
				.query("workspaceMembers")
				.withIndex("by_user", (q) => q.eq("userId", userId))
				.collect()
		).sort(
			(a, b) => b.joinedAt - a.joinedAt || b._creationTime - a._creationTime,
		);

		const orgMemberships = (
			await ctx.db
				.query("organizationMembers")
				.withIndex("by_user", (q) => q.eq("userId", userId))
				.collect()
		).sort(
			(a, b) => b.joinedAt - a.joinedAt || b._creationTime - a._creationTime,
		);

		let organizationId: Id<"organizations"> | undefined;
		if (
			targetUser.lastActiveOrganizationId &&
			orgMemberships.some(
				(membership) =>
					membership.organizationId === targetUser.lastActiveOrganizationId,
			)
		) {
			organizationId = targetUser.lastActiveOrganizationId;
		}

		if (!organizationId && targetUser.lastActiveWorkspaceId) {
			const workspace = await ctx.db.get(targetUser.lastActiveWorkspaceId);
			if (workspace && !workspace.deletedAt && workspace.organizationId) {
				organizationId = workspace.organizationId;
			}
		}

		if (!organizationId && orgMemberships.length > 0) {
			organizationId = orgMemberships[0].organizationId;
		}

		if (!organizationId) {
			for (const membership of workspaceMemberships) {
				const workspace = await ctx.db.get(membership.workspaceId);
				if (workspace && !workspace.deletedAt && workspace.organizationId) {
					organizationId = workspace.organizationId;
					break;
				}
			}
		}

		if (!organizationId) {
			throw new ConvexError("User is not a member of any organization");
		}

		let preferredWorkspaceId: Id<"workspaces"> | undefined;

		if (targetUser.lastActiveWorkspaceId) {
			const workspace = await ctx.db.get(targetUser.lastActiveWorkspaceId);
			if (
				workspace &&
				!workspace.deletedAt &&
				workspace.organizationId === organizationId
			) {
				preferredWorkspaceId = workspace._id;
			}
		}

		if (!preferredWorkspaceId) {
			for (const membership of workspaceMemberships) {
				const workspace = await ctx.db.get(membership.workspaceId);
				if (
					workspace &&
					!workspace.deletedAt &&
					workspace.organizationId === organizationId
				) {
					preferredWorkspaceId = workspace._id;
					break;
				}
			}
		}

		return await openOrganizationPathForAdmin(
			ctx,
			callerId,
			organizationId,
			preferredWorkspaceId,
		);
	},
});

// ── Analytics ─────────────────────────────────────────────────────────────

/** User + org signups per day for the last 30 days */
export const getGrowthMetrics = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const now = Date.now();
		const cutoff = now - 30 * MS_PER_DAY;

		const grid = new Map<string, { users: number; organizations: number }>();
		for (let i = 29; i >= 0; i--) {
			const date = dayBucket(now - i * MS_PER_DAY);
			grid.set(date, { users: 0, organizations: 0 });
		}

		const allUsers = await ctx.db.query("users").collect();
		for (const user of allUsers) {
			if (user._creationTime < cutoff) continue;
			const date = dayBucket(user._creationTime);
			const entry = grid.get(date);
			if (entry) entry.users++;
		}

		const allOrgs = await ctx.db.query("organizations").collect();
		for (const org of allOrgs) {
			if (org.deletedAt) continue;
			const timestamp = org.createdAt ?? org._creationTime;
			if (timestamp < cutoff) continue;
			const date = dayBucket(timestamp);
			const entry = grid.get(date);
			if (entry) entry.organizations++;
		}

		return Array.from(grid.entries()).map(([date, counts]) => ({
			date,
			...counts,
		}));
	},
});

/** Unique active users per day for the last 14 days (from workspacePresence) */
export const getActiveUserMetrics = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const now = Date.now();
		const cutoff = now - 14 * MS_PER_DAY;

		const grid = new Map<string, Set<string>>();
		for (let i = 13; i >= 0; i--) {
			const date = dayBucket(now - i * MS_PER_DAY);
			grid.set(date, new Set());
		}

		const users = await ctx.db.query("users").collect();
		const activeUserIds = new Set(
			users.filter((user) => !user.suspended).map((user) => user._id),
		);
		const presenceRecords = await ctx.db.query("workspacePresence").collect();

		for (const presence of presenceRecords) {
			if (presence.lastActiveAt < cutoff) continue;
			if (!activeUserIds.has(presence.userId)) continue;
			const date = dayBucket(presence.lastActiveAt);
			const entry = grid.get(date);
			if (entry) entry.add(presence.userId);
		}

		return Array.from(grid.entries()).map(([date, userSet]) => ({
			date,
			activeUsers: userSet.size,
		}));
	},
});

/** Count organizations by plan key */
export const getPlanDistribution = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const orgs = await ctx.db.query("organizations").collect();
		const counts = { free: 0, pro: 0, enterprise: 0 };

		for (const org of orgs) {
			if (org.deletedAt) continue;
			const plan = org.plan ?? "free";
			if (plan in counts) {
				counts[plan as keyof typeof counts]++;
			}
		}

		return counts;
	},
});

/** Top 10 organizations by member count */
export const getTopOrganizations = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const organizations = await ctx.db.query("organizations").collect();
		const activeOrganizations = organizations.filter(
			(organization) => !organization.deletedAt,
		);
		const allMembers = await ctx.db.query("organizationMembers").collect();

		const memberCounts = new Map<string, number>();
		for (const membership of allMembers) {
			memberCounts.set(
				membership.organizationId,
				(memberCounts.get(membership.organizationId) ?? 0) + 1,
			);
		}

		return activeOrganizations
			.map((organization) => ({
				name: organization.name,
				members: memberCounts.get(organization._id) ?? 0,
			}))
			.sort((a, b) => b.members - a.members)
			.slice(0, 10);
	},
});

/** Workspace stats: total, public, private counts */
export const getWorkspaceStats = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const workspaces = await ctx.db.query("workspaces").collect();
		const activeWorkspaces = workspaces.filter(
			(workspace) => !workspace.deletedAt,
		);

		let publicCount = 0;
		let privateCount = 0;
		for (const workspace of activeWorkspaces) {
			if ((workspace.visibility ?? "public") === "public") {
				publicCount++;
			} else {
				privateCount++;
			}
		}

		return {
			total: activeWorkspaces.length,
			public: publicCount,
			private: privateCount,
		};
	},
});

/** Analytics consistency checks for QA visibility in the admin portal. */
export const getAnalyticsHealth = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const [users, organizations, workspaces, presenceRecords] =
			await Promise.all([
				ctx.db.query("users").collect(),
				ctx.db.query("organizations").collect(),
				ctx.db.query("workspaces").collect(),
				ctx.db.query("workspacePresence").collect(),
			]);

		const activeUsers = users.filter((user) => !user.suspended);
		const activeUserIds = new Set(activeUsers.map((user) => user._id));
		const activeOrganizations = organizations.filter(
			(organization) => !organization.deletedAt,
		);
		const activeWorkspaces = workspaces.filter(
			(workspace) => !workspace.deletedAt,
		);

		let freePlans = 0;
		let proPlans = 0;
		let enterprisePlans = 0;
		for (const organization of activeOrganizations) {
			const plan = organization.plan ?? "free";
			if (plan === "pro") proPlans++;
			else if (plan === "enterprise") enterprisePlans++;
			else freePlans++;
		}

		let publicWorkspaces = 0;
		let privateWorkspaces = 0;
		for (const workspace of activeWorkspaces) {
			if ((workspace.visibility ?? "public") === "public") publicWorkspaces++;
			else privateWorkspaces++;
		}

		const cutoff = Date.now() - 14 * MS_PER_DAY;
		const activeUsersPerDay = new Map<string, Set<string>>();
		for (const presence of presenceRecords) {
			if (presence.lastActiveAt < cutoff) continue;
			if (!activeUserIds.has(presence.userId)) continue;
			const bucket = dayBucket(presence.lastActiveAt);
			const usersForDay = activeUsersPerDay.get(bucket) ?? new Set<string>();
			usersForDay.add(presence.userId);
			activeUsersPerDay.set(bucket, usersForDay);
		}

		let maxDailyActiveUsers = 0;
		for (const usersForDay of activeUsersPerDay.values()) {
			if (usersForDay.size > maxDailyActiveUsers) {
				maxDailyActiveUsers = usersForDay.size;
			}
		}

		const checks = [
			{
				id: "plan_distribution_total",
				label: "Plan totals match active organizations",
				ok:
					freePlans + proPlans + enterprisePlans === activeOrganizations.length,
				expected: activeOrganizations.length,
				actual: freePlans + proPlans + enterprisePlans,
			},
			{
				id: "workspace_visibility_total",
				label: "Workspace visibility totals match active workspaces",
				ok: publicWorkspaces + privateWorkspaces === activeWorkspaces.length,
				expected: activeWorkspaces.length,
				actual: publicWorkspaces + privateWorkspaces,
			},
			{
				id: "active_users_bounds",
				label: "Daily active users remain within registered user bounds",
				ok: maxDailyActiveUsers <= activeUsers.length,
				expected: activeUsers.length,
				actual: maxDailyActiveUsers,
			},
		];

		return {
			healthy: checks.every((check) => check.ok),
			generatedAt: Date.now(),
			checks,
		};
	},
});
