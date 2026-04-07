import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import {
	requireAuth,
	requireWorkspaceAdmin,
	requireWorkspaceMember,
} from "./lib/auth";
import { checkPlanLimit } from "./lib/planLimits";

/** List all members of a workspace with user profile data */
export const list = query({
	args: { workspaceId: v.id("workspaces") },
	returns: v.array(
		v.object({
			_id: v.id("workspaceMembers"),
			_creationTime: v.number(),
			workspaceId: v.id("workspaces"),
			userId: v.id("users"),
			role: v.union(v.literal("admin"), v.literal("member")),
			joinedAt: v.number(),
			user: v.union(
				v.object({
					_id: v.id("users"),
					name: v.optional(v.string()),
					email: v.optional(v.string()),
					image: v.optional(v.string()),
					avatarUrl: v.optional(v.string()),
					role: v.optional(v.string()),
				}),
				v.null(),
			),
		}),
	),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const members = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		const result = [];
		for (const member of members) {
			const user = await ctx.db.get(member.userId);
			// Skip demo users from the member list
			if (user?.isDemoUser) continue;
			let avatarUrl: string | undefined;
			if (user?.avatarStorageId) {
				const url = await ctx.storage.getUrl(user.avatarStorageId);
				if (url) avatarUrl = url;
			}
			result.push({
				...member,
				user: user
					? {
							_id: user._id,
							name: user.name,
							email: user.email,
							image: user.image,
							avatarUrl: avatarUrl ?? user.image,
							role: user.role,
						}
					: null,
			});
		}

		return result;
	},
});

/** Get the current user's role in a workspace */
export const myRole = query({
	args: { workspaceId: v.id("workspaces") },
	returns: v.union(
		v.object({
			role: v.union(v.literal("admin"), v.literal("member")),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		try {
			const { member } = await requireWorkspaceMember(ctx, args.workspaceId);
			return { role: member.role };
		} catch {
			return null;
		}
	},
});

/** Join a workspace using an invite code */
export const joinWithCode = mutation({
	args: { code: v.string() },
	returns: v.id("workspaces"),
	handler: async (ctx, args) => {
		const userId = await requireAuth(ctx);

		// Find the invite code
		const inviteCode = await ctx.db
			.query("inviteCodes")
			.withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
			.unique();

		if (!inviteCode) {
			throw new ConvexError("Invalid invite code");
		}

		// Check status is pending (default to pending for backward compatibility)
		const status = inviteCode.status ?? "pending";
		if (status !== "pending") {
			throw new ConvexError("This invite code is no longer valid");
		}

		// Check expiry
		if (inviteCode.expiresAt && inviteCode.expiresAt < Date.now()) {
			throw new ConvexError("This invite code has expired");
		}

		// Check max uses
		if (inviteCode.maxUses && inviteCode.useCount >= inviteCode.maxUses) {
			throw new ConvexError("This invite code has reached its usage limit");
		}

		// Check workspace is not deleted
		const workspace = await ctx.db.get(inviteCode.workspaceId);
		if (!workspace || workspace.deletedAt) {
			throw new ConvexError("Workspace no longer exists");
		}

		// Check plan member limit before adding
		await checkPlanLimit(ctx, inviteCode.workspaceId, "maxMembers");

		// Check if user is already a workspace member
		const existingMember = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", inviteCode.workspaceId).eq("userId", userId),
			)
			.unique();

		if (existingMember) {
			// Already a member, just return the workspace ID.
			return inviteCode.workspaceId;
		}

		// Add user with the role specified on the invite code
		await ctx.db.insert("workspaceMembers", {
			workspaceId: inviteCode.workspaceId,
			userId,
			role: inviteCode.role ?? "member",
			joinedAt: Date.now(),
		});

		// Update invite code usage and mark as accepted
		const usedBy = inviteCode.usedBy || [];
		await ctx.db.patch(inviteCode._id, {
			useCount: inviteCode.useCount + 1,
			usedBy: [...usedBy, userId],
			status: "accepted",
			acceptedBy: userId,
			acceptedAt: Date.now(),
		});

		return inviteCode.workspaceId;
	},
});

/** Remove a member from a workspace (admin only, cannot remove owner or last admin) */
export const remove = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { userId: currentUserId } = await requireWorkspaceAdmin(
			ctx,
			args.workspaceId,
		);

		// Cannot remove yourself
		if (currentUserId === args.userId) {
			throw new ConvexError("Cannot remove yourself from the workspace");
		}

		// Cannot remove the workspace owner
		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace) throw new ConvexError("Workspace not found");
		if (workspace.ownerId === args.userId) {
			throw new ConvexError("Cannot remove the workspace owner");
		}

		const member = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
			)
			.unique();

		if (!member) throw new ConvexError("User is not a workspace member");

		// Cannot remove the last admin
		if (member.role === "admin") {
			const allMembers = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.collect();
			const adminCount = allMembers.filter((m) => m.role === "admin").length;
			if (adminCount <= 1) {
				throw new ConvexError("Cannot remove the last admin");
			}
		}

		await ctx.db.delete(member._id);
		return null;
	},
});

/** Update a member's role (admin only, cannot change owner's role or demote last admin) */
export const updateRole = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		role: v.union(v.literal("admin"), v.literal("member")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { userId: currentUserId } = await requireWorkspaceAdmin(
			ctx,
			args.workspaceId,
		);

		// Cannot change your own role
		if (currentUserId === args.userId) {
			throw new ConvexError("Cannot change your own role");
		}

		// Cannot change the workspace owner's role
		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace) throw new ConvexError("Workspace not found");
		if (workspace.ownerId === args.userId) {
			throw new ConvexError("Cannot change the workspace owner's role");
		}

		const member = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
			)
			.unique();

		if (!member) throw new ConvexError("User is not a workspace member");

		// Cannot demote the last admin
		if (member.role === "admin" && args.role !== "admin") {
			const allMembers = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
				.collect();
			const adminCount = allMembers.filter((m) => m.role === "admin").length;
			if (adminCount <= 1) {
				throw new ConvexError("Cannot demote the last admin");
			}
		}

		await ctx.db.patch(member._id, { role: args.role });
		return null;
	},
});
