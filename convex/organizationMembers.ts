import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation, query } from "./_generated/server";
import { requireAuth, requireOrgAdmin, requireOrgMember } from "./lib/auth";
import { checkPlanLimit } from "./lib/planLimits";

const orgRoleValidator = v.union(
	v.literal("owner"),
	v.literal("admin"),
	v.literal("member"),
);

/** List all members of an organization with user profile data */
export const list = query({
	args: { organizationId: v.id("organizations") },
	returns: v.array(
		v.object({
			_id: v.id("organizationMembers"),
			_creationTime: v.number(),
			organizationId: v.id("organizations"),
			userId: v.id("users"),
			role: orgRoleValidator,
			joinedAt: v.number(),
			invitedBy: v.optional(v.id("users")),
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
		await requireOrgMember(ctx, args.organizationId);

		const members = await ctx.db
			.query("organizationMembers")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.collect();

		const result = [];
		for (const member of members) {
			const user = await ctx.db.get(member.userId);
			// Skip demo users - they should not appear in org member lists
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

/** Get the current user's role in an organization */
export const myRole = query({
	args: { organizationId: v.id("organizations") },
	returns: v.union(
		v.object({
			role: orgRoleValidator,
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		try {
			const { member } = await requireOrgMember(ctx, args.organizationId);
			return { role: member.role };
		} catch {
			return null;
		}
	},
});

/** Join an organization using an invite code */
export const joinWithCode = mutation({
	args: { code: v.string() },
	returns: v.id("organizations"),
	handler: async (ctx, args) => {
		const userId = await requireAuth(ctx);

		// Find the invite code
		const inviteCode = await ctx.db
			.query("organizationInviteCodes")
			.withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
			.unique();

		if (!inviteCode) {
			throw new ConvexError("Invalid invite code");
		}

		// Check expiry
		if (inviteCode.expiresAt && inviteCode.expiresAt < Date.now()) {
			throw new ConvexError("This invite code has expired");
		}

		// Check max uses
		if (inviteCode.maxUses && inviteCode.useCount >= inviteCode.maxUses) {
			throw new ConvexError("This invite code has reached its usage limit");
		}

		// Check organization is not deleted
		const org = await ctx.db.get(inviteCode.organizationId);
		if (!org || org.deletedAt) {
			throw new ConvexError("Organization no longer exists");
		}

		// Check if user is already a member
		const existingMember = await ctx.db
			.query("organizationMembers")
			.withIndex("by_org_user", (q) =>
				q.eq("organizationId", inviteCode.organizationId).eq("userId", userId),
			)
			.unique();

		if (existingMember) {
			// Already a member, just return the organization ID
			return inviteCode.organizationId;
		}

		// Check plan member limit before adding
		await checkPlanLimit(ctx, inviteCode.organizationId, "maxMembers");

		// Add user as member with the role from the invite code
		await ctx.db.insert("organizationMembers", {
			organizationId: inviteCode.organizationId,
			userId,
			role: inviteCode.role,
			joinedAt: Date.now(),
			invitedBy: inviteCode.createdBy,
		});

		// Update invite code usage
		const usedBy = inviteCode.usedBy || [];
		await ctx.db.patch(inviteCode._id, {
			useCount: inviteCode.useCount + 1,
			usedBy: [...usedBy, userId],
		});

		// Sync seat count to Stripe (fire-and-forget)
		await ctx.scheduler.runAfter(0, internal.billing.syncSeatCount, {
			organizationId: inviteCode.organizationId,
		});

		return inviteCode.organizationId;
	},
});

/** Remove a member from an organization (admin/owner only) */
export const remove = mutation({
	args: {
		organizationId: v.id("organizations"),
		userId: v.id("users"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { userId: currentUserId } = await requireOrgAdmin(
			ctx,
			args.organizationId,
		);

		// Cannot remove yourself (use leave instead)
		if (currentUserId === args.userId) {
			throw new ConvexError(
				"Cannot remove yourself from the organization. Use leave instead.",
			);
		}

		const member = await ctx.db
			.query("organizationMembers")
			.withIndex("by_org_user", (q) =>
				q.eq("organizationId", args.organizationId).eq("userId", args.userId),
			)
			.unique();

		if (!member) throw new ConvexError("User is not an organization member");

		// Cannot remove the owner
		if (member.role === "owner") {
			throw new ConvexError("Cannot remove the organization owner");
		}

		// Cannot remove the last admin
		if (member.role === "admin") {
			const allMembers = await ctx.db
				.query("organizationMembers")
				.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
				.collect();
			const adminCount = allMembers.filter((m) => m.role === "admin").length;
			if (adminCount <= 1) {
				// Check if there's an owner who can still manage
				const hasOwner = allMembers.some((m) => m.role === "owner");
				if (!hasOwner) {
					throw new ConvexError("Cannot remove the last admin");
				}
			}
		}

		await ctx.db.delete(member._id);

		// Sync seat count to Stripe (fire-and-forget)
		await ctx.scheduler.runAfter(0, internal.billing.syncSeatCount, {
			organizationId: args.organizationId,
		});

		return null;
	},
});

/** Update a member's role (admin/owner only) */
export const updateRole = mutation({
	args: {
		organizationId: v.id("organizations"),
		userId: v.id("users"),
		role: v.union(v.literal("admin"), v.literal("member")),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { userId: currentUserId } = await requireOrgAdmin(
			ctx,
			args.organizationId,
		);

		// Cannot change your own role
		if (currentUserId === args.userId) {
			throw new ConvexError("Cannot change your own role");
		}

		const member = await ctx.db
			.query("organizationMembers")
			.withIndex("by_org_user", (q) =>
				q.eq("organizationId", args.organizationId).eq("userId", args.userId),
			)
			.unique();

		if (!member) throw new ConvexError("User is not an organization member");

		// Cannot change the owner's role
		if (member.role === "owner") {
			throw new ConvexError("Cannot change the organization owner's role");
		}

		// Cannot demote the last admin
		if (member.role === "admin" && args.role !== "admin") {
			const allMembers = await ctx.db
				.query("organizationMembers")
				.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
				.collect();
			const adminCount = allMembers.filter((m) => m.role === "admin").length;
			if (adminCount <= 1) {
				// Check if there's an owner who can still manage
				const hasOwner = allMembers.some((m) => m.role === "owner");
				if (!hasOwner) {
					throw new ConvexError("Cannot demote the last admin");
				}
			}
		}

		await ctx.db.patch(member._id, { role: args.role });
		return null;
	},
});

/** Leave an organization (self-service) */
export const leave = mutation({
	args: { organizationId: v.id("organizations") },
	returns: v.null(),
	handler: async (ctx, args) => {
		const { member } = await requireOrgMember(ctx, args.organizationId);

		// Owner cannot leave — must transfer ownership first
		if (member.role === "owner") {
			throw new ConvexError(
				"Organization owner cannot leave. Transfer ownership first.",
			);
		}

		// If this is the last admin, check if there's an owner
		if (member.role === "admin") {
			const allMembers = await ctx.db
				.query("organizationMembers")
				.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
				.collect();
			const adminCount = allMembers.filter((m) => m.role === "admin").length;
			if (adminCount <= 1) {
				const hasOwner = allMembers.some((m) => m.role === "owner");
				if (!hasOwner) {
					throw new ConvexError(
						"Cannot leave as the last admin. Promote another member first.",
					);
				}
			}
		}

		await ctx.db.delete(member._id);

		// Sync seat count to Stripe (fire-and-forget)
		await ctx.scheduler.runAfter(0, internal.billing.syncSeatCount, {
			organizationId: args.organizationId,
		});

		return null;
	},
});
