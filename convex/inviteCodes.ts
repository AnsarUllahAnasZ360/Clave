import { ConvexError, v } from "convex/values";
import { action, mutation, query } from "./_generated/server";
import { sendEmail } from "./email";
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
		role: v.optional(v.union(v.literal("admin"), v.literal("member"))),
		maxUses: v.optional(v.number()),
		expiresInHours: v.optional(v.number()),
		sentTo: v.optional(v.string()),
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
			role: args.role ?? "member",
			expiresAt,
			maxUses: args.maxUses,
			useCount: 0,
			usedBy: [],
			status: "pending",
			sentTo: args.sentTo,
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

		// Check status is pending (default to pending for backward compatibility)
		const status = inviteCode.status ?? "pending";
		if (status !== "pending") {
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
			status: v.optional(
				v.union(
					v.literal("pending"),
					v.literal("accepted"),
					v.literal("expired"),
					v.literal("rejected"),
				),
			),
			sentTo: v.optional(v.string()),
			acceptedBy: v.optional(v.id("users")),
			acceptedAt: v.optional(v.number()),
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
			status: code.status,
			sentTo: code.sentTo,
			acceptedBy: code.acceptedBy,
			acceptedAt: code.acceptedAt,
		}));
	},
});

/** Mark an invite code as accepted */
export const markAsAccepted = mutation({
	args: {
		codeId: v.id("inviteCodes"),
		userId: v.id("users"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const code = await ctx.db.get(args.codeId);
		if (!code) {
			throw new ConvexError("Invite code not found");
		}

		await ctx.db.patch(args.codeId, {
			status: "accepted",
			acceptedBy: args.userId,
			acceptedAt: Date.now(),
		});

		return null;
	},
});

/** Mark an invite code as expired */
export const markAsExpired = mutation({
	args: {
		codeId: v.id("inviteCodes"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const code = await ctx.db.get(args.codeId);
		if (!code) {
			throw new ConvexError("Invite code not found");
		}

		await ctx.db.patch(args.codeId, {
			status: "expired",
		});

		return null;
	},
});

/** Revoke a pending invite (mark as rejected) */
export const revokePendingInvite = mutation({
	args: {
		codeId: v.id("inviteCodes"),
		workspaceId: v.id("workspaces"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);

		const code = await ctx.db.get(args.codeId);
		if (!code) {
			throw new ConvexError("Invite code not found");
		}

		if (code.status !== "pending") {
			throw new ConvexError("Only pending invites can be revoked");
		}

		await ctx.db.patch(args.codeId, {
			status: "rejected",
		});

		return null;
	},
});

/** List all pending invites for a workspace (admin only) */
export const listPendingByWorkspace = query({
	args: { workspaceId: v.id("workspaces") },
	returns: v.array(
		v.object({
			_id: v.id("inviteCodes"),
			_creationTime: v.number(),
			code: v.string(),
			workspaceId: v.id("workspaces"),
			createdBy: v.id("users"),
			role: v.union(v.literal("admin"), v.literal("member")),
			expiresAt: v.optional(v.number()),
			sentTo: v.optional(v.string()),
		}),
	),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);

		const now = Date.now();
		const codes = await ctx.db
			.query("inviteCodes")
			.withIndex("by_workspace_status", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("status", "pending"),
			)
			.collect();

		// Filter out expired ones
		return codes
			.filter((code) => !code.expiresAt || code.expiresAt > now)
			.map((code) => ({
				_id: code._id,
				_creationTime: code._creationTime,
				code: code.code,
				workspaceId: code.workspaceId,
				createdBy: code.createdBy,
				role: code.role ?? "member",
				expiresAt: code.expiresAt,
				sentTo: code.sentTo,
			}));
	},
});

/** Send a workspace invite email via Plunk */
export const sendInviteEmail = action({
	args: {
		email: v.string(),
		inviteCode: v.string(),
		workspaceName: v.string(),
		inviterName: v.string(),
		role: v.union(v.literal("admin"), v.literal("member")),
		sentTo: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (_ctx, args) => {
		const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://clave.z360.biz";
		const inviteLink = `${appUrl}/join?invite=${args.inviteCode}`;
		const roleLabel = args.role === "admin" ? "an Admin" : "a Member";

		await sendEmail({
			to: args.email,
			subject: `You're invited to join ${args.workspaceName} on Clave`,
			body: [
				`<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">`,
				`<h2 style="color: #C26A3A;">Join ${args.workspaceName} on Clave</h2>`,
				`<p>${args.inviterName} has invited you to join <strong>${args.workspaceName}</strong> as ${roleLabel}.</p>`,
				`<p>Use the invite code below or click the link to join:</p>`,
				`<div style="background: #1a1a1a; border-radius: 8px; padding: 16px; text-align: center; margin: 24px 0;">`,
				`<code style="font-size: 24px; letter-spacing: 4px; color: #fafafa;">${args.inviteCode}</code>`,
				`</div>`,
				`<a href="${inviteLink}" style="display: inline-block; background: #C26A3A; color: #fafafa; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600;">Join workspace</a>`,
				`<p style="color: #888; font-size: 13px; margin-top: 24px;">If you didn't expect this invitation, you can safely ignore this email.</p>`,
				`</div>`,
			].join("\n"),
		});
		return null;
	},
});
