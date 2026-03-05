import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { requireWorkspaceAdmin } from "./lib/auth";

// Characters for invite codes (no ambiguous chars: 0/O, 1/I/l)
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function generateCode(length: number = 6): string {
	let code = "";
	for (let i = 0; i < length; i++) {
		code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
	}
	return code;
}

/** Generate a new invite code for a workspace (admin only) */
export const generate = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		maxUses: v.optional(v.number()),
		expiresInHours: v.optional(v.number()),
	},
	returns: v.string(),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceAdmin(ctx, args.workspaceId);

		// Generate a unique code
		let code: string;
		let attempts = 0;
		do {
			code = generateCode(6);
			const existing = await ctx.db
				.query("inviteCodes")
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

		await ctx.db.insert("inviteCodes", {
			code,
			workspaceId: args.workspaceId,
			createdBy: userId,
			expiresAt,
			maxUses: args.maxUses,
			useCount: 0,
			usedBy: [],
		});

		return code;
	},
});

/** Validate an invite code (check if exists, not expired, not at max uses) */
export const validate = query({
	args: { code: v.string() },
	returns: v.union(
		v.object({
			valid: v.boolean(),
			workspaceName: v.optional(v.string()),
			workspaceId: v.optional(v.id("workspaces")),
			workspaceSlug: v.optional(v.string()),
		}),
		v.null(),
	),
	handler: async (ctx, args) => {
		const inviteCode = await ctx.db
			.query("inviteCodes")
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

		// Get workspace info
		const workspace = await ctx.db.get(inviteCode.workspaceId);
		if (!workspace || workspace.deletedAt) {
			return { valid: false };
		}

		return {
			valid: true,
			workspaceName: workspace.name,
			workspaceId: workspace._id,
			workspaceSlug: workspace.slug,
		};
	},
});

/** List invite codes for a workspace (admin only) */
export const listByWorkspace = query({
	args: { workspaceId: v.id("workspaces") },
	returns: v.array(
		v.object({
			_id: v.id("inviteCodes"),
			_creationTime: v.number(),
			code: v.string(),
			workspaceId: v.id("workspaces"),
			createdBy: v.id("users"),
			expiresAt: v.optional(v.number()),
			maxUses: v.optional(v.number()),
			useCount: v.number(),
		}),
	),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);

		const codes = await ctx.db
			.query("inviteCodes")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		return codes.map((code) => ({
			_id: code._id,
			_creationTime: code._creationTime,
			code: code.code,
			workspaceId: code.workspaceId,
			createdBy: code.createdBy,
			expiresAt: code.expiresAt,
			maxUses: code.maxUses,
			useCount: code.useCount,
		}));
	},
});
