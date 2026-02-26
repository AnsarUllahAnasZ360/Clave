import { makeFunctionReference } from "convex/server";
import { ConvexError, v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalMutation, mutation, query } from "./_generated/server";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "./lib/auth";

const providerValidator = v.literal("google-chat");
const targetTypeValidator = v.union(v.literal("dm"), v.literal("space"));

const sendRelayMessageRef = makeFunctionReference<
	"action",
	{
		notificationId: Id<"notifications">;
		workspaceId: Id<"workspaces">;
		targetType: "dm" | "space";
		targetId: string;
	},
	{ status: "sent" | "failed" | "dropped"; reason?: string }
>("chat/googleChatSender:sendRelayMessage");

const relaySubscriptionValidator = v.object({
	_id: v.id("chatSubscriptions"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	provider: providerValidator,
	targetType: targetTypeValidator,
	targetId: v.string(),
	eventType: v.string(),
	enabled: v.boolean(),
	createdBy: v.id("users"),
	createdAt: v.number(),
	updatedAt: v.number(),
});

export const GOOGLE_CHAT_RELAY_EVENT_TYPES = [
	"issue_assigned",
	"issue_status_changed",
	"issue_mentioned",
	"comment",
	"project_update",
	"document_comment",
] as const;

type RelayTarget = {
	targetType: "dm" | "space";
	targetId: string;
};

function resolveProvider(provider: "google-chat" | undefined): "google-chat" {
	return provider ?? "google-chat";
}

async function canDeliverDirectMessage(args: {
	ctx: MutationCtx;
	workspaceId: Id<"workspaces">;
	provider: "google-chat";
	targetId: string;
	eventType: string;
}) {
	const explicitDmRule = await args.ctx.db
		.query("chatSubscriptions")
		.withIndex("by_workspace_provider_target_event_type", (q) =>
			q
				.eq("workspaceId", args.workspaceId)
				.eq("provider", args.provider)
				.eq("targetType", "dm")
				.eq("targetId", args.targetId)
				.eq("eventType", args.eventType),
		)
		.first();

	// DMs are enabled by default unless an explicit disabled rule exists.
	if (!explicitDmRule) {
		return true;
	}
	return explicitDmRule.enabled;
}

export async function enqueueGoogleChatRelayForNotification(
	ctx: MutationCtx,
	args: {
		notificationId: Id<"notifications">;
		workspaceId: Id<"workspaces">;
		userId: Id<"users">;
		eventType: string;
		scheduleSend?: boolean;
	},
): Promise<{ queued: number; skipped: number }> {
	const provider: "google-chat" = "google-chat";

	const [connection, policy] = await Promise.all([
		ctx.db
			.query("chatConnections")
			.withIndex("by_workspace_provider", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("provider", provider),
			)
			.first(),
		ctx.db
			.query("chatPolicies")
			.withIndex("by_workspace_provider", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("provider", provider),
			)
			.first(),
	]);

	if (!connection || connection.status !== "connected") {
		return { queued: 0, skipped: 1 };
	}

	if (policy && !policy.enabled) {
		return { queued: 0, skipped: 1 };
	}

	const [recipient, directLink, spaceSubscriptions] = await Promise.all([
		ctx.db.get(args.userId),
		ctx.db
			.query("chatUserLinks")
			.withIndex("by_workspace_provider_user_id", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", provider)
					.eq("userId", args.userId),
			)
			.unique(),
		ctx.db
			.query("chatSubscriptions")
			.withIndex("by_workspace_provider_event_type", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", provider)
					.eq("eventType", args.eventType),
			)
			.collect(),
	]);

	if (!recipient) {
		return { queued: 0, skipped: 1 };
	}

	const targets: RelayTarget[] = [];
	const allowDirectMessages = policy?.allowDirectMessages ?? true;
	const allowSpaces = policy?.allowSpaces ?? true;
	const requireIdentityLink = policy?.requireIdentityLink ?? true;

	if (
		allowDirectMessages &&
		recipient.notifyGoogleChat !== false &&
		(!requireIdentityLink || directLink)
	) {
		const dmTargetId = directLink?.chatUserId;
		if (dmTargetId) {
			const canDeliver = await canDeliverDirectMessage({
				ctx,
				workspaceId: args.workspaceId,
				provider,
				targetId: dmTargetId,
				eventType: args.eventType,
			});
			if (canDeliver) {
				targets.push({ targetType: "dm", targetId: dmTargetId });
			}
		}
	}

	if (allowSpaces) {
		const spaceTargets = new Set(
			spaceSubscriptions
				.filter(
					(sub) =>
						sub.provider === provider &&
						sub.targetType === "space" &&
						sub.enabled,
				)
				.map((sub) => sub.targetId),
		);
		for (const targetId of spaceTargets) {
			targets.push({ targetType: "space", targetId });
		}
	}

	if (targets.length === 0) {
		return { queued: 0, skipped: 1 };
	}

	let queued = 0;

	for (const target of targets) {
		if (args.scheduleSend ?? true) {
			await ctx.scheduler.runAfter(0, sendRelayMessageRef, {
				notificationId: args.notificationId,
				workspaceId: args.workspaceId,
				targetType: target.targetType,
				targetId: target.targetId,
			});
		}
		queued += 1;
	}

	return { queued, skipped: 0 };
}

export const enqueueNotificationRelay = internalMutation({
	args: {
		notificationId: v.id("notifications"),
		scheduleSend: v.optional(v.boolean()),
	},
	returns: v.object({
		queued: v.number(),
		skipped: v.number(),
	}),
	handler: async (ctx, args) => {
		const notification = await ctx.db.get(args.notificationId);
		if (!notification) {
			return { queued: 0, skipped: 1 };
		}

		const eventType = notification.eventType ?? notification.type;
		return enqueueGoogleChatRelayForNotification(ctx, {
			notificationId: notification._id,
			workspaceId: notification.workspaceId,
			userId: notification.userId,
			eventType,
			scheduleSend: args.scheduleSend,
		});
	},
});

export const listSpaceSubscriptions = query({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
	},
	returns: v.array(relaySubscriptionValidator),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		const provider = resolveProvider(args.provider);

		const subscriptions = await ctx.db
			.query("chatSubscriptions")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		return subscriptions
			.filter((sub) => sub.provider === provider && sub.targetType === "space")
			.sort((a, b) => {
				const targetCompare = a.targetId.localeCompare(b.targetId);
				if (targetCompare !== 0) return targetCompare;
				return a.eventType.localeCompare(b.eventType);
			});
	},
});

export const setSpaceSubscription = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
		targetId: v.string(),
		eventType: v.string(),
		enabled: v.boolean(),
	},
	returns: v.id("chatSubscriptions"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceAdmin(ctx, args.workspaceId);
		const provider = resolveProvider(args.provider);

		if (!args.targetId.startsWith("spaces/")) {
			throw new ConvexError(
				"Google Chat space target must use resource format spaces/{space}",
			);
		}

		const now = Date.now();
		const existing = await ctx.db
			.query("chatSubscriptions")
			.withIndex("by_workspace_provider_target_event_type", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", provider)
					.eq("targetType", "space")
					.eq("targetId", args.targetId)
					.eq("eventType", args.eventType),
			)
			.first();

		if (existing) {
			await ctx.db.patch(existing._id, {
				enabled: args.enabled,
				updatedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("chatSubscriptions", {
			workspaceId: args.workspaceId,
			provider,
			targetType: "space",
			targetId: args.targetId,
			eventType: args.eventType,
			enabled: args.enabled,
			createdBy: userId,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const removeSpaceSubscriptionsForTarget = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
		targetId: v.string(),
	},
	returns: v.number(),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);
		const provider = resolveProvider(args.provider);

		const existing = await ctx.db
			.query("chatSubscriptions")
			.withIndex("by_workspace_provider_target", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", provider)
					.eq("targetType", "space")
					.eq("targetId", args.targetId),
			)
			.collect();

		for (const subscription of existing) {
			await ctx.db.delete(subscription._id);
		}

		return existing.length;
	},
});
