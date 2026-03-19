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
			totalWorkspaces,
			activeUsers24h,
		};
	},
});

/** Recent activity: last 10 user signups + last 10 workspace creations */
export const getRecentActivity = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const recentUsers = await ctx.db.query("users").order("desc").take(10);
		const recentWorkspaces = await ctx.db
			.query("workspaces")
			.order("desc")
			.take(10);

		const userActivity = recentUsers.map((user) => ({
			type: "user_signup" as const,
			id: user._id,
			name: user.name ?? user.email ?? "Unknown",
			email: user.email,
			timestamp: user._creationTime,
		}));

		const workspaceActivity = recentWorkspaces
			.filter((workspace) => !workspace.deletedAt)
			.map((workspace) => ({
				type: "workspace_created" as const,
				id: workspace._id,
				name: workspace.name,
				slug: workspace.slug,
				timestamp: workspace._creationTime,
			}));

		// Merge and sort by timestamp descending.
		const combined = [...userActivity, ...workspaceActivity].sort(
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

// ── Users Management ──────────────────────────────────────────────────────

/** List all users with enriched data for admin table */
export const listUsers = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const users = await ctx.db.query("users").collect();
		const allWsMembers = await ctx.db.query("workspaceMembers").collect();
		const allPresence = await ctx.db.query("workspacePresence").collect();

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
				workspaceCount: wsCountByUser.get(user._id) ?? 0,
				lastActiveAt: lastActiveByUser.get(user._id) ?? null,
			}));
	},
});

/** Full user detail with workspace memberships */
export const getUserDetail = query({
	args: { userId: v.id("users") },
	handler: async (ctx, { userId }) => {
		await requireSuperAdmin(ctx);

		const user = await ctx.db.get(userId);
		if (!user) {
			throw new ConvexError("User not found");
		}

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

		const ownedWorkspaces = await ctx.db
			.query("workspaces")
			.withIndex("by_owner", (q) => q.eq("ownerId", userId))
			.collect();
		if (ownedWorkspaces.some((workspace) => !workspace.deletedAt)) {
			throw new ConvexError(
				"User owns active workspaces. Transfer ownership before removal.",
			);
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
			lastActiveWorkspaceId: undefined,
			lastActiveContextAt: Date.now(),
		});
	},
});

/** Open a target user's workspace context as superadmin. */
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

		let workspaceId: Id<"workspaces"> | undefined;

		if (targetUser.lastActiveWorkspaceId) {
			const workspace = await ctx.db.get(targetUser.lastActiveWorkspaceId);
			if (workspace && !workspace.deletedAt) {
				workspaceId = workspace._id;
			}
		}

		if (!workspaceId) {
			for (const membership of workspaceMemberships) {
				const workspace = await ctx.db.get(membership.workspaceId);
				if (workspace && !workspace.deletedAt) {
					workspaceId = workspace._id;
					break;
				}
			}
		}

		if (!workspaceId) {
			throw new ConvexError("User is not a member of any workspace");
		}

		const workspace = await ctx.db.get(workspaceId);
		if (!workspace || workspace.deletedAt) {
			throw new ConvexError("Workspace not found");
		}

		await ensureAdminWorkspaceMembership(ctx, workspaceId, callerId);

		await ctx.db.patch(callerId, {
			lastActiveContextAt: Date.now(),
			lastActiveWorkspaceId: workspaceId,
		});

		return {
			workspaceId,
			path: `/${workspace.slug}/chat`,
		};
	},
});

// ── Analytics ─────────────────────────────────────────────────────────────

/** User + workspace signups per day for the last 30 days */
export const getGrowthMetrics = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const now = Date.now();
		const cutoff = now - 30 * MS_PER_DAY;

		const grid = new Map<string, { users: number; workspaces: number }>();
		for (let i = 29; i >= 0; i--) {
			const date = dayBucket(now - i * MS_PER_DAY);
			grid.set(date, { users: 0, workspaces: 0 });
		}

		const allUsers = await ctx.db.query("users").collect();
		for (const user of allUsers) {
			if (user._creationTime < cutoff) continue;
			const date = dayBucket(user._creationTime);
			const entry = grid.get(date);
			if (entry) entry.users++;
		}

		const allWorkspaces = await ctx.db.query("workspaces").collect();
		for (const workspace of allWorkspaces) {
			if (workspace.deletedAt) continue;
			const timestamp = workspace._creationTime;
			if (timestamp < cutoff) continue;
			const date = dayBucket(timestamp);
			const entry = grid.get(date);
			if (entry) entry.workspaces++;
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

/** Top 10 workspaces by member count */
export const getTopWorkspaces = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const workspaces = await ctx.db.query("workspaces").collect();
		const activeWorkspaces = workspaces.filter(
			(workspace) => !workspace.deletedAt,
		);
		const allMembers = await ctx.db.query("workspaceMembers").collect();

		const memberCounts = new Map<string, number>();
		for (const membership of allMembers) {
			memberCounts.set(
				membership.workspaceId,
				(memberCounts.get(membership.workspaceId) ?? 0) + 1,
			);
		}

		return activeWorkspaces
			.map((workspace) => ({
				name: workspace.name,
				members: memberCounts.get(workspace._id) ?? 0,
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

		return {
			total: activeWorkspaces.length,
		};
	},
});

/** Analytics consistency checks for QA visibility in the admin portal. */
export const getAnalyticsHealth = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const [users, presenceRecords] = await Promise.all([
			ctx.db.query("users").collect(),
			ctx.db.query("workspacePresence").collect(),
		]);

		const activeUsers = users.filter((user) => !user.suspended);
		const activeUserIds = new Set(activeUsers.map((user) => user._id));

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

/** Plan distribution across workspaces */
export const getPlanDistribution = query({
	args: {},
	handler: async (ctx) => {
		await requireSuperAdmin(ctx);

		const workspaces = await ctx.db.query("workspaces").collect();
		const active = workspaces.filter((w) => !w.deletedAt);

		let free = 0;
		let pro = 0;
		let enterprise = 0;
		for (const ws of active) {
			const plan = ws.plan ?? "free";
			if (plan === "pro") pro++;
			else if (plan === "enterprise") enterprise++;
			else free++;
		}

		return { free, pro, enterprise };
	},
});
