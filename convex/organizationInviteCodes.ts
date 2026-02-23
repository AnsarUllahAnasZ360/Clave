import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireOrgAdmin } from "./lib/auth";

// Characters for invite codes (no ambiguous chars: 0/O, 1/I/l)
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(length: number = 6): string {
	let code = "";
	for (let i = 0; i < length; i++) {
		code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
	}
	return code;
}

/** Generate a new invite code for an organization (admin/owner only) */
export const generate = mutation({
	args: {
		organizationId: v.id("organizations"),
		role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
		maxUses: v.optional(v.number()),
		expiresInHours: v.optional(v.number()),
	},
	returns: v.string(),
	handler: async (ctx, args) => {
		const { userId } = await requireOrgAdmin(ctx, args.organizationId);

		// Generate a unique code
		let code: string;
		let attempts = 0;
		do {
			code = generateCode(6);
			const existing = await ctx.db
				.query("organizationInviteCodes")
				.withIndex("by_code", (q) => q.eq("code", code))
				.unique();
			if (!existing) break;
			attempts++;
		} while (attempts < 10);

		if (attempts >= 10) {
			throw new ConvexError("Failed to generate a unique invite code");
		}

		const expiresAt = args.expiresInHours
			? Date.now() + args.expiresInHours * 60 * 60 * 1000
			: undefined;

		await ctx.db.insert("organizationInviteCodes", {
			code,
			organizationId: args.organizationId,
			createdBy: userId,
			expiresAt,
			maxUses: args.maxUses,
			useCount: 0,
			usedBy: [],
			role: args.role ?? "member",
		});

		return code;
	},
});

/** Validate an organization invite code (public, no auth required) */
export const validate = query({
	args: { code: v.string() },
	returns: v.union(
		v.object({
			valid: v.boolean(),
			orgName: v.optional(v.string()),
			organizationId: v.optional(v.id("organizations")),
			role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const inviteCode = await ctx.db
			.query("organizationInviteCodes")
			.withIndex("by_code", (q) => q.eq("code", args.code.toUpperCase()))
			.unique();

		if (!inviteCode) {
			return { valid: false };
		}

		// Check expiry
		if (inviteCode.expiresAt && inviteCode.expiresAt < Date.now()) {
			return { valid: false };
		}

		// Check max uses
		if (inviteCode.maxUses && inviteCode.useCount >= inviteCode.maxUses) {
			return { valid: false };
		}

		// Get organization info
		const org = await ctx.db.get(inviteCode.organizationId);
		if (!org || org.deletedAt) {
			return { valid: false };
		}

		return {
			valid: true,
			orgName: org.name,
			organizationId: org._id,
			role: inviteCode.role,
		};
	},
});

/** List invite codes for an organization (admin/owner only, strips usedBy for privacy) */
export const listByOrg = query({
	args: { organizationId: v.id("organizations") },
	returns: v.array(
		v.object({
			_id: v.id("organizationInviteCodes"),
			_creationTime: v.number(),
			code: v.string(),
			organizationId: v.id("organizations"),
			createdBy: v.id("users"),
			expiresAt: v.optional(v.number()),
			maxUses: v.optional(v.number()),
			useCount: v.number(),
			role: v.union(v.literal("admin"), v.literal("member")),
		}),
	),
	handler: async (ctx, args) => {
		await requireOrgAdmin(ctx, args.organizationId);

		const codes = await ctx.db
			.query("organizationInviteCodes")
			.withIndex("by_org", (q) => q.eq("organizationId", args.organizationId))
			.collect();

		return codes.map((code) => ({
			_id: code._id,
			_creationTime: code._creationTime,
			code: code.code,
			organizationId: code.organizationId,
			createdBy: code.createdBy,
			expiresAt: code.expiresAt,
			maxUses: code.maxUses,
			useCount: code.useCount,
			role: code.role,
		}));
	},
});

/** Revoke (hard-delete) an organization invite code (admin/owner only) */
export const revoke = mutation({
	args: {
		organizationId: v.id("organizations"),
		codeId: v.id("organizationInviteCodes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireOrgAdmin(ctx, args.organizationId);

		const code = await ctx.db.get(args.codeId);
		if (!code) {
			throw new ConvexError("Invite code not found");
		}

		// Ensure the code belongs to this organization
		if (code.organizationId !== args.organizationId) {
			throw new ConvexError("Invite code does not belong to this organization");
		}

		await ctx.db.delete(args.codeId);
		return null;
	},
});
