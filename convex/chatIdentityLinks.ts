import { ConvexError, v } from "convex/values";
import { internalQuery, mutation, query } from "./_generated/server";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "./lib/auth";

const providerValidator = v.literal("google-chat");

type Provider = "google-chat";

function resolveProvider(provider: Provider | undefined): Provider {
	return provider ?? "google-chat";
}

const chatUserLinkValidator = v.object({
	_id: v.id("chatUserLinks"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	provider: providerValidator,
	chatUserId: v.string(),
	chatDisplayName: v.optional(v.string()),
	chatEmail: v.optional(v.string()),
	userId: v.id("users"),
	linkedBy: v.id("users"),
	linkedAt: v.number(),
	updatedAt: v.number(),
});

export const getMyLink = query({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
	},
	returns: v.union(chatUserLinkValidator, v.null()),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const provider = resolveProvider(args.provider);

		const link = await ctx.db
			.query("chatUserLinks")
			.withIndex("by_workspace_provider_user_id", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", provider)
					.eq("userId", userId),
			)
			.unique();

		return link ?? null;
	},
});

export const listWorkspaceLinks = query({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
	},
	returns: v.array(chatUserLinkValidator),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);
		const provider = resolveProvider(args.provider);

		const links = await ctx.db
			.query("chatUserLinks")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		return links
			.filter((link) => link.provider === provider)
			.sort((a, b) => a.chatUserId.localeCompare(b.chatUserId));
	},
});

export const upsertLink = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
		chatUserId: v.string(),
		chatDisplayName: v.optional(v.string()),
		chatEmail: v.optional(v.string()),
		userId: v.id("users"),
	},
	returns: v.id("chatUserLinks"),
	handler: async (ctx, args) => {
		const { userId: actorId } = await requireWorkspaceAdmin(
			ctx,
			args.workspaceId,
		);
		const provider = resolveProvider(args.provider);
		const now = Date.now();

		const workspaceMembership = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("userId", args.userId),
			)
			.unique();
		if (!workspaceMembership) {
			throw new ConvexError("Target user is not a member of this workspace");
		}

		const existingByChatUserId = await ctx.db
			.query("chatUserLinks")
			.withIndex("by_workspace_provider_chat_user_id", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", provider)
					.eq("chatUserId", args.chatUserId),
			)
			.unique();

		if (existingByChatUserId && existingByChatUserId.userId !== args.userId) {
			throw new ConvexError(
				"Google Chat identity is already linked to another workspace user",
			);
		}

		const existingByUserId = await ctx.db
			.query("chatUserLinks")
			.withIndex("by_workspace_provider_user_id", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", provider)
					.eq("userId", args.userId),
			)
			.unique();

		if (existingByUserId) {
			await ctx.db.patch(existingByUserId._id, {
				chatUserId: args.chatUserId,
				chatDisplayName: args.chatDisplayName,
				chatEmail: args.chatEmail,
				linkedBy: actorId,
				updatedAt: now,
			});
			return existingByUserId._id;
		}

		return await ctx.db.insert("chatUserLinks", {
			workspaceId: args.workspaceId,
			provider,
			chatUserId: args.chatUserId,
			chatDisplayName: args.chatDisplayName,
			chatEmail: args.chatEmail,
			userId: args.userId,
			linkedBy: actorId,
			linkedAt: now,
			updatedAt: now,
		});
	},
});

export const unlink = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
		userId: v.optional(v.id("users")),
		chatUserId: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);
		const provider = resolveProvider(args.provider);

		if (!args.userId && !args.chatUserId) {
			throw new ConvexError("Provide userId or chatUserId to unlink");
		}
		const userId = args.userId;

		const link = userId
			? await ctx.db
					.query("chatUserLinks")
					.withIndex("by_workspace_provider_user_id", (q) =>
						q
							.eq("workspaceId", args.workspaceId)
							.eq("provider", provider)
							.eq("userId", userId),
					)
					.unique()
			: await (async () => {
					const chatUserId = args.chatUserId;
					if (!chatUserId) return null;
					return await ctx.db
						.query("chatUserLinks")
						.withIndex("by_workspace_provider_chat_user_id", (q) =>
							q
								.eq("workspaceId", args.workspaceId)
								.eq("provider", provider)
								.eq("chatUserId", chatUserId),
						)
						.unique();
				})();

		if (!link) {
			return null;
		}

		await ctx.db.delete(link._id);
		return null;
	},
});

export const unlinkSelf = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const provider = resolveProvider(args.provider);

		const link = await ctx.db
			.query("chatUserLinks")
			.withIndex("by_workspace_provider_user_id", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", provider)
					.eq("userId", userId),
			)
			.unique();

		if (link) {
			await ctx.db.delete(link._id);
		}

		return null;
	},
});

export const resolveLinkedUserForWebhook = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
		chatUserId: v.string(),
	},
	returns: v.union(v.id("users"), v.null()),
	handler: async (ctx, args) => {
		const provider = resolveProvider(args.provider);
		const link = await ctx.db
			.query("chatUserLinks")
			.withIndex("by_workspace_provider_chat_user_id", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", provider)
					.eq("chatUserId", args.chatUserId),
			)
			.unique();

		return link?.userId ?? null;
	},
});
