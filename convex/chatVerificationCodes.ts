import { ConvexError, v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireWorkspaceMember } from "./lib/auth";

// Same unambiguous charset as inviteCodes.ts
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";
const CODE_LENGTH = 6;
const CODE_TTL_MS = 5 * 60 * 1000; // 5 minutes

function makeCode(): string {
	let code = "";
	for (let i = 0; i < CODE_LENGTH; i++) {
		code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
	}
	return code;
}

export const generateCode = mutation({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.object({ code: v.string(), expiresAt: v.number() }),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const now = Date.now();

		// Expire any previous pending codes for this user+workspace
		const pendingCodes = await ctx.db
			.query("chatVerificationCodes")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("userId", userId),
			)
			.collect();

		for (const pending of pendingCodes) {
			if (pending.status === "pending") {
				await ctx.db.patch(pending._id, { status: "expired" });
			}
		}

		// Generate unique code
		let code: string;
		let attempts = 0;
		do {
			code = makeCode();
			const existing = await ctx.db
				.query("chatVerificationCodes")
				.withIndex("by_code", (q) => q.eq("code", code))
				.first();
			if (!existing || existing.status !== "pending") break;
			attempts++;
		} while (attempts < 10);

		if (attempts >= 10) {
			throw new ConvexError("Failed to generate a unique verification code");
		}

		const expiresAt = now + CODE_TTL_MS;
		await ctx.db.insert("chatVerificationCodes", {
			workspaceId: args.workspaceId,
			userId,
			code,
			expiresAt,
			status: "pending",
			createdAt: now,
		});

		return { code, expiresAt };
	},
});

export const getMyPendingCode = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.union(
		v.object({ code: v.string(), expiresAt: v.number() }),
		v.null(),
	),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const now = Date.now();

		const codes = await ctx.db
			.query("chatVerificationCodes")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("userId", userId),
			)
			.collect();

		const pending = codes.find(
			(c) => c.status === "pending" && c.expiresAt > now,
		);
		if (!pending) return null;

		return { code: pending.code, expiresAt: pending.expiresAt };
	},
});

export const consumeCode = internalMutation({
	args: {
		code: v.string(),
		chatUserId: v.string(),
		chatDisplayName: v.optional(v.string()),
		chatEmail: v.optional(v.string()),
	},
	returns: v.object({
		success: v.boolean(),
		message: v.string(),
		workspaceId: v.optional(v.id("workspaces")),
		userId: v.optional(v.id("users")),
	}),
	handler: async (ctx, args) => {
		const now = Date.now();

		const codeDoc = await ctx.db
			.query("chatVerificationCodes")
			.withIndex("by_code", (q) => q.eq("code", args.code))
			.first();

		if (!codeDoc || codeDoc.status !== "pending") {
			return { success: false, message: "Invalid or expired code" };
		}

		if (codeDoc.expiresAt < now) {
			await ctx.db.patch(codeDoc._id, { status: "expired" });
			return { success: false, message: "Code has expired" };
		}

		// Mark code as consumed
		await ctx.db.patch(codeDoc._id, {
			status: "consumed",
			consumedByChatUserId: args.chatUserId,
			consumedAt: now,
		});

		// Upsert the identity link
		const provider = "google-chat" as const;
		const existingByChatUserId = await ctx.db
			.query("chatUserLinks")
			.withIndex("by_workspace_provider_chat_user_id", (q) =>
				q
					.eq("workspaceId", codeDoc.workspaceId)
					.eq("provider", provider)
					.eq("chatUserId", args.chatUserId),
			)
			.unique();

		if (
			existingByChatUserId &&
			existingByChatUserId.userId !== codeDoc.userId
		) {
			return {
				success: false,
				message:
					"This Google Chat identity is already linked to another workspace user",
			};
		}

		const existingByUserId = await ctx.db
			.query("chatUserLinks")
			.withIndex("by_workspace_provider_user_id", (q) =>
				q
					.eq("workspaceId", codeDoc.workspaceId)
					.eq("provider", provider)
					.eq("userId", codeDoc.userId),
			)
			.unique();

		if (existingByUserId) {
			await ctx.db.patch(existingByUserId._id, {
				chatUserId: args.chatUserId,
				chatDisplayName: args.chatDisplayName,
				chatEmail: args.chatEmail,
				linkedBy: codeDoc.userId,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert("chatUserLinks", {
				workspaceId: codeDoc.workspaceId,
				provider,
				chatUserId: args.chatUserId,
				chatDisplayName: args.chatDisplayName,
				chatEmail: args.chatEmail,
				userId: codeDoc.userId,
				linkedBy: codeDoc.userId,
				linkedAt: now,
				updatedAt: now,
			});
		}

		return {
			success: true,
			message: "Identity linked successfully",
			workspaceId: codeDoc.workspaceId,
			userId: codeDoc.userId,
		};
	},
});

/**
 * Public mutation for consuming a verification code from the Chat SDK handlers.
 * The code itself acts as the secret — no auth required.
 */
export const consumeCodePublic = mutation({
	args: {
		code: v.string(),
		chatUserId: v.string(),
		chatDisplayName: v.optional(v.string()),
		chatEmail: v.optional(v.string()),
	},
	returns: v.object({
		success: v.boolean(),
		message: v.string(),
		workspaceId: v.optional(v.id("workspaces")),
		userId: v.optional(v.id("users")),
	}),
	handler: async (ctx, args) => {
		const now = Date.now();

		const codeDoc = await ctx.db
			.query("chatVerificationCodes")
			.withIndex("by_code", (q) => q.eq("code", args.code))
			.first();

		if (!codeDoc || codeDoc.status !== "pending") {
			return { success: false, message: "Invalid or expired code" };
		}

		if (codeDoc.expiresAt < now) {
			await ctx.db.patch(codeDoc._id, { status: "expired" });
			return { success: false, message: "Code has expired" };
		}

		await ctx.db.patch(codeDoc._id, {
			status: "consumed",
			consumedByChatUserId: args.chatUserId,
			consumedAt: now,
		});

		const provider = "google-chat" as const;
		const existingByChatUserId = await ctx.db
			.query("chatUserLinks")
			.withIndex("by_workspace_provider_chat_user_id", (q) =>
				q
					.eq("workspaceId", codeDoc.workspaceId)
					.eq("provider", provider)
					.eq("chatUserId", args.chatUserId),
			)
			.unique();

		if (
			existingByChatUserId &&
			existingByChatUserId.userId !== codeDoc.userId
		) {
			return {
				success: false,
				message:
					"This Google Chat identity is already linked to another workspace user",
			};
		}

		const existingByUserId = await ctx.db
			.query("chatUserLinks")
			.withIndex("by_workspace_provider_user_id", (q) =>
				q
					.eq("workspaceId", codeDoc.workspaceId)
					.eq("provider", provider)
					.eq("userId", codeDoc.userId),
			)
			.unique();

		if (existingByUserId) {
			await ctx.db.patch(existingByUserId._id, {
				chatUserId: args.chatUserId,
				chatDisplayName: args.chatDisplayName,
				chatEmail: args.chatEmail,
				linkedBy: codeDoc.userId,
				updatedAt: now,
			});
		} else {
			await ctx.db.insert("chatUserLinks", {
				workspaceId: codeDoc.workspaceId,
				provider,
				chatUserId: args.chatUserId,
				chatDisplayName: args.chatDisplayName,
				chatEmail: args.chatEmail,
				userId: codeDoc.userId,
				linkedBy: codeDoc.userId,
				linkedAt: now,
				updatedAt: now,
			});
		}

		return {
			success: true,
			message: "Identity linked successfully",
			workspaceId: codeDoc.workspaceId,
			userId: codeDoc.userId,
		};
	},
});
