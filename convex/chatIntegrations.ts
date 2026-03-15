import { ConvexError, v } from "convex/values";
// @ts-ignore — resolved by Convex bundler at deploy time
import { GOOGLE_CHAT_DEFAULT_ALLOWED_ACTION_IDS } from "../src/lib/chat/google-chat/interaction-contract";
import type { Id } from "./_generated/dataModel";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "./_generated/server";
import { requireWorkspaceAdmin, requireWorkspaceMember } from "./lib/auth";

const providerValidator = v.literal("google-chat");

const connectionStatusValidator = v.union(
	v.literal("connected"),
	v.literal("disconnected"),
	v.literal("error"),
);

const healthStatusValidator = v.union(
	v.literal("ok"),
	v.literal("error"),
	v.literal("unknown"),
);

const connectionDocValidator = v.object({
	_id: v.id("chatConnections"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	provider: providerValidator,
	status: connectionStatusValidator,
	webhookUrl: v.optional(v.string()),
	authAudience: v.optional(v.string()),
	externalAppId: v.optional(v.string()),
	externalAppName: v.optional(v.string()),
	installedBy: v.id("users"),
	installedAt: v.number(),
	disconnectedAt: v.optional(v.number()),
	// Kept optional for backward compat with existing documents (removed from schema)
	lastHealthcheckAt: v.optional(v.number()),
	lastHealthcheckStatus: v.optional(healthStatusValidator),
	lastHealthcheckMessage: v.optional(v.string()),
	lastWebhookEventAt: v.optional(v.number()),
	lastWebhookEventId: v.optional(v.string()),
	marketplaceInstallId: v.optional(v.string()),
	marketplaceInstalledAt: v.optional(v.number()),
	marketplaceProjectNumber: v.optional(v.string()),
	createdAt: v.number(),
	updatedAt: v.number(),
});

const rolloutStateValidator = v.union(
	v.literal("disabled"),
	v.literal("canary"),
	v.literal("general"),
	v.literal("emergency_off"),
);

const policyDocValidator = v.object({
	_id: v.id("chatPolicies"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	provider: providerValidator,
	enabled: v.boolean(),
	allowDirectMessages: v.boolean(),
	allowSpaces: v.boolean(),
	requireIdentityLink: v.boolean(),
	allowedIssueActionIds: v.optional(v.array(v.string())),
	requireActionConfirmation: v.optional(v.boolean()),
	// Kept optional for backward compat with existing documents (removed from schema)
	rolloutState: v.optional(rolloutStateValidator),
	rolloutCanaryTargetIds: v.optional(v.array(v.string())),
	rolloutUpdatedBy: v.optional(v.id("users")),
	rolloutUpdatedAt: v.optional(v.number()),
	emergencyOffReason: v.optional(v.string()),
	emergencyOffAt: v.optional(v.number()),
	rolloutOverrideBy: v.optional(v.id("users")),
	rolloutOverrideAt: v.optional(v.number()),
	rolloutOverrideReason: v.optional(v.string()),
	updatedBy: v.id("users"),
	createdAt: v.number(),
	updatedAt: v.number(),
});

const webhookPolicyValidator = v.object({
	enabled: v.boolean(),
	allowDirectMessages: v.boolean(),
	allowSpaces: v.boolean(),
	requireIdentityLink: v.boolean(),
	allowedIssueActionIds: v.optional(v.array(v.string())),
	requireActionConfirmation: v.optional(v.boolean()),
});

const webhookConversationValidator = v.object({
	aiThreadId: v.string(),
	conversationKey: v.string(),
	spaceName: v.string(),
	chatThreadName: v.optional(v.string()),
	chatMessageName: v.optional(v.string()),
	chatUserId: v.optional(v.string()),
	lastMessageAt: v.optional(v.number()),
});

type Provider = "google-chat";

function getPolicyDefaults(args: {
	userId: Id<"users">;
	now: number;
	workspaceId: Id<"workspaces">;
	provider: Provider;
}) {
	return {
		workspaceId: args.workspaceId,
		provider: args.provider,
		enabled: true,
		allowDirectMessages: true,
		allowSpaces: true,
		requireIdentityLink: true,
		allowedIssueActionIds: GOOGLE_CHAT_DEFAULT_ALLOWED_ACTION_IDS,
		requireActionConfirmation: false,
		updatedBy: args.userId,
		createdAt: args.now,
		updatedAt: args.now,
	};
}

function resolveProvider(provider: Provider | undefined): Provider {
	return provider ?? "google-chat";
}

export const getConnectionStatus = query({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
	},
	returns: v.object({
		provider: providerValidator,
		connection: v.union(connectionDocValidator, v.null()),
		policy: v.union(policyDocValidator, v.null()),
	}),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);

		const provider = resolveProvider(args.provider);
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

		return {
			provider,
			connection: connection ?? null,
			policy: policy ?? null,
		};
	},
});

export const connect = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
		webhookUrl: v.optional(v.string()),
		authAudience: v.optional(v.string()),
		externalAppId: v.optional(v.string()),
		externalAppName: v.optional(v.string()),
		marketplaceInstallId: v.optional(v.string()),
		marketplaceProjectNumber: v.optional(v.string()),
	},
	returns: v.id("chatConnections"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceAdmin(ctx, args.workspaceId);
		const provider = resolveProvider(args.provider);
		const now = Date.now();

		const existingConnection = await ctx.db
			.query("chatConnections")
			.withIndex("by_workspace_provider", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("provider", provider),
			)
			.first();

		const marketplaceFields = {
			...(args.marketplaceInstallId !== undefined && {
				marketplaceInstallId: args.marketplaceInstallId,
				marketplaceInstalledAt: now,
			}),
			...(args.marketplaceProjectNumber !== undefined && {
				marketplaceProjectNumber: args.marketplaceProjectNumber,
			}),
		};

		const connectionId = existingConnection
			? existingConnection._id
			: await ctx.db.insert("chatConnections", {
					workspaceId: args.workspaceId,
					provider,
					status: "connected",
					webhookUrl: args.webhookUrl,
					authAudience: args.authAudience,
					externalAppId: args.externalAppId,
					externalAppName: args.externalAppName,
					...marketplaceFields,
					installedBy: userId,
					installedAt: now,
					createdAt: now,
					updatedAt: now,
				});

		if (existingConnection) {
			await ctx.db.patch(existingConnection._id, {
				status: "connected",
				webhookUrl: args.webhookUrl,
				authAudience: args.authAudience,
				externalAppId: args.externalAppId,
				externalAppName: args.externalAppName,
				...marketplaceFields,
				installedBy: userId,
				installedAt: now,
				disconnectedAt: undefined,
				updatedAt: now,
			});
		}

		const existingPolicy = await ctx.db
			.query("chatPolicies")
			.withIndex("by_workspace_provider", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("provider", provider),
			)
			.first();

		if (!existingPolicy) {
			await ctx.db.insert(
				"chatPolicies",
				getPolicyDefaults({
					userId,
					now,
					workspaceId: args.workspaceId,
					provider,
				}),
			);
		}

		return connectionId;
	},
});

export const disconnect = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		await requireWorkspaceAdmin(ctx, args.workspaceId);
		const provider = resolveProvider(args.provider);

		const existingConnection = await ctx.db
			.query("chatConnections")
			.withIndex("by_workspace_provider", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("provider", provider),
			)
			.first();

		if (!existingConnection) {
			throw new ConvexError("Google Chat integration not found");
		}

		const now = Date.now();
		await ctx.db.patch(existingConnection._id, {
			status: "disconnected",
			disconnectedAt: now,
			updatedAt: now,
		});

		return null;
	},
});

export const updatePolicy = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		provider: v.optional(providerValidator),
		enabled: v.optional(v.boolean()),
		allowDirectMessages: v.optional(v.boolean()),
		allowSpaces: v.optional(v.boolean()),
		requireIdentityLink: v.optional(v.boolean()),
		allowedIssueActionIds: v.optional(v.array(v.string())),
		requireActionConfirmation: v.optional(v.boolean()),
	},
	returns: v.id("chatPolicies"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceAdmin(ctx, args.workspaceId);
		const provider = resolveProvider(args.provider);
		const now = Date.now();

		const existingPolicy = await ctx.db
			.query("chatPolicies")
			.withIndex("by_workspace_provider", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("provider", provider),
			)
			.first();

		if (!existingPolicy) {
			const defaults = getPolicyDefaults({
				userId,
				now,
				workspaceId: args.workspaceId,
				provider,
			});
			return await ctx.db.insert("chatPolicies", {
				...defaults,
				enabled: args.enabled ?? defaults.enabled,
				allowDirectMessages:
					args.allowDirectMessages ?? defaults.allowDirectMessages,
				allowSpaces: args.allowSpaces ?? defaults.allowSpaces,
				requireIdentityLink:
					args.requireIdentityLink ?? defaults.requireIdentityLink,
				allowedIssueActionIds:
					args.allowedIssueActionIds ?? defaults.allowedIssueActionIds,
				requireActionConfirmation:
					args.requireActionConfirmation ?? defaults.requireActionConfirmation,
			});
		}

		await ctx.db.patch(existingPolicy._id, {
			enabled: args.enabled ?? existingPolicy.enabled,
			allowDirectMessages:
				args.allowDirectMessages ?? existingPolicy.allowDirectMessages,
			allowSpaces: args.allowSpaces ?? existingPolicy.allowSpaces,
			requireIdentityLink:
				args.requireIdentityLink ?? existingPolicy.requireIdentityLink,
			allowedIssueActionIds:
				args.allowedIssueActionIds ??
				existingPolicy.allowedIssueActionIds ??
				GOOGLE_CHAT_DEFAULT_ALLOWED_ACTION_IDS,
			requireActionConfirmation:
				args.requireActionConfirmation ??
				existingPolicy.requireActionConfirmation ??
				false,
			updatedBy: userId,
			updatedAt: now,
		});

		return existingPolicy._id;
	},
});

export const resolveWorkspaceForWebhook = query({
	args: {
		provider: providerValidator,
		spaceName: v.optional(v.string()),
	},
	returns: v.union(v.id("workspaces"), v.null()),
	handler: async (ctx, args) => {
		const [connectedConnections, errorConnections] = await Promise.all([
			ctx.db
				.query("chatConnections")
				.withIndex("by_provider_status", (q) =>
					q.eq("provider", args.provider).eq("status", "connected"),
				)
				.collect(),
			ctx.db
				.query("chatConnections")
				.withIndex("by_provider_status", (q) =>
					q.eq("provider", args.provider).eq("status", "error"),
				)
				.collect(),
		]);
		const candidateConnections = [...connectedConnections, ...errorConnections];

		if (candidateConnections.length === 0) {
			return null;
		}

		if (candidateConnections.length === 1) {
			return candidateConnections[0].workspaceId;
		}

		if (!args.spaceName) {
			return null;
		}
		const spaceName = args.spaceName;

		for (const connection of candidateConnections) {
			const subscription = await ctx.db
				.query("chatSubscriptions")
				.withIndex("by_workspace_provider_target", (q) =>
					q
						.eq("workspaceId", connection.workspaceId)
						.eq("provider", args.provider)
						.eq("targetType", "space")
						.eq("targetId", spaceName),
				)
				.first();
			if (subscription?.enabled) {
				return connection.workspaceId;
			}
		}

		return null;
	},
});

export const getPolicyForWebhook = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		provider: providerValidator,
	},
	returns: webhookPolicyValidator,
	handler: async (ctx, args) => {
		const policy = await ctx.db
			.query("chatPolicies")
			.withIndex("by_workspace_provider", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("provider", args.provider),
			)
			.first();

		return {
			enabled: policy?.enabled ?? true,
			allowDirectMessages: policy?.allowDirectMessages ?? true,
			allowSpaces: policy?.allowSpaces ?? true,
			requireIdentityLink: policy?.requireIdentityLink ?? true,
			allowedIssueActionIds:
				policy?.allowedIssueActionIds ?? GOOGLE_CHAT_DEFAULT_ALLOWED_ACTION_IDS,
			requireActionConfirmation: policy?.requireActionConfirmation ?? false,
		};
	},
});

export const getConversationForWebhook = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		provider: providerValidator,
		conversationKey: v.string(),
	},
	returns: v.union(webhookConversationValidator, v.null()),
	handler: async (ctx, args) => {
		const mapping = await ctx.db
			.query("chatConversations")
			.withIndex("by_workspace_provider_conversation_key", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", args.provider)
					.eq("conversationKey", args.conversationKey),
			)
			.unique();
		if (!mapping) {
			return null;
		}

		return {
			aiThreadId: mapping.aiThreadId,
			conversationKey: mapping.conversationKey,
			spaceName: mapping.spaceName,
			chatThreadName: mapping.chatThreadName,
			chatMessageName: mapping.chatMessageName,
			chatUserId: mapping.chatUserId,
			lastMessageAt: mapping.lastMessageAt,
		};
	},
});

export const upsertConversationForWebhook = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		provider: providerValidator,
		spaceName: v.string(),
		conversationKey: v.string(),
		aiThreadId: v.string(),
		chatThreadName: v.optional(v.string()),
		chatMessageName: v.optional(v.string()),
		chatUserId: v.optional(v.string()),
		eventTime: v.optional(v.number()),
	},
	returns: v.id("chatConversations"),
	handler: async (ctx, args) => {
		const now = Date.now();
		const existing = await ctx.db
			.query("chatConversations")
			.withIndex("by_workspace_provider_conversation_key", (q) =>
				q
					.eq("workspaceId", args.workspaceId)
					.eq("provider", args.provider)
					.eq("conversationKey", args.conversationKey),
			)
			.unique();

		if (existing) {
			await ctx.db.patch(existing._id, {
				spaceName: args.spaceName,
				aiThreadId: args.aiThreadId,
				chatThreadName: args.chatThreadName,
				chatMessageName: args.chatMessageName,
				chatUserId: args.chatUserId,
				lastMessageAt: args.eventTime,
				updatedAt: now,
			});
			return existing._id;
		}

		return await ctx.db.insert("chatConversations", {
			workspaceId: args.workspaceId,
			provider: args.provider,
			spaceName: args.spaceName,
			conversationKey: args.conversationKey,
			chatThreadName: args.chatThreadName,
			chatMessageName: args.chatMessageName,
			chatUserId: args.chatUserId,
			aiThreadId: args.aiThreadId,
			createdAt: now,
			updatedAt: now,
			lastMessageAt: args.eventTime,
		});
	},
});

export const recordWebhookHealthInternal = internalMutation({
	args: {
		workspaceId: v.optional(v.id("workspaces")),
		provider: providerValidator,
		eventId: v.string(),
		status: healthStatusValidator,
		message: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		if (!args.workspaceId) {
			return null;
		}
		const workspaceId = args.workspaceId;

		const connection = await ctx.db
			.query("chatConnections")
			.withIndex("by_workspace_provider", (q) =>
				q.eq("workspaceId", workspaceId).eq("provider", args.provider),
			)
			.first();

		if (!connection) {
			return null;
		}

		// Health fields removed from schema — only update connection status on error
		await ctx.db.patch(connection._id, {
			status: args.status === "error" ? "error" : connection.status,
			updatedAt: Date.now(),
		});

		return null;
	},
});
