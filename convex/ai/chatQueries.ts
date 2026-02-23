import {
	filterOutOrphanedToolMessages,
	listMessages,
	listUIMessages,
	syncStreams,
	vMessageDoc,
	vStreamArgs,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { internalQuery, query } from "../_generated/server";
import { requireAuth, requireWorkspaceMember } from "../lib/auth";

// ── Thread Ownership Helper (reusable auth + ownership check) ────────────

export async function requireThreadOwnership(
	ctx: QueryCtx | MutationCtx,
	threadId: string,
) {
	const userId = await requireAuth(ctx);
	const metadata = await ctx.db
		.query("aiThreads")
		.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
		.unique();
	if (!metadata) {
		throw new ConvexError("Thread not found");
	}
	if (metadata.userId !== userId) {
		throw new ConvexError("You can only access your own threads");
	}
	return { userId, metadata };
}

// ── Auth Helper (used by sendMessage action via ctx.runQuery) ────────────

export const validateAuth = internalQuery({
	args: { workspaceId: v.id("workspaces") },
	returns: v.id("users"),
	handler: async (ctx, { workspaceId }) => {
		const { userId } = await requireWorkspaceMember(ctx, workspaceId);
		return userId;
	},
});

// ── Workspace Context (used by sendMessage for system prompt injection) ──

export const getWorkspaceContext = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
	},
	returns: v.object({
		workspaceName: v.string(),
		userName: v.string(),
	}),
	handler: async (ctx, { workspaceId, userId }) => {
		const workspace = await ctx.db.get(workspaceId);
		const user = await ctx.db.get(userId);
		return {
			workspaceName: workspace?.name ?? "Unknown workspace",
			userName: user?.name ?? "Unknown user",
		};
	},
});

// ── Combined Auth + Context (single round-trip for sendMessage action) ──

export const getAuthAndContext = internalQuery({
	args: { workspaceId: v.id("workspaces") },
	returns: v.object({
		userId: v.id("users"),
		workspaceName: v.string(),
		userName: v.string(),
		aiAboutMe: v.optional(v.string()),
		aiHowToWorkWithMe: v.optional(v.string()),
		aiWorkspaceContext: v.optional(v.string()),
		aiAssistantCharacteristics: v.optional(v.string()),
	}),
	handler: async (ctx, { workspaceId }) => {
		const { userId } = await requireWorkspaceMember(ctx, workspaceId);
		const workspace = await ctx.db.get(workspaceId);
		const user = await ctx.db.get(userId);
		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.unique();
		return {
			userId,
			workspaceName: workspace?.name ?? "Unknown workspace",
			userName: user?.name ?? "Unknown user",
			aiAboutMe: user?.aiAboutMe,
			aiHowToWorkWithMe: user?.aiHowToWorkWithMe,
			aiWorkspaceContext: settings?.aiWorkspaceContext,
			aiAssistantCharacteristics: settings?.aiAssistantCharacteristics,
		};
	},
});

// ── AI Teammate Config for Thread (used by sendMessage to apply overrides) ──

export const getTeammateForThread = internalQuery({
	args: { threadId: v.string() },
	returns: v.union(
		v.object({
			name: v.string(),
			systemPrompt: v.string(),
			model: v.optional(v.string()),
			temperature: v.optional(v.number()),
			enabledTools: v.optional(v.array(v.string())),
		}),
		v.null(),
	),
	handler: async (ctx, { threadId }) => {
		const metadata = await ctx.db
			.query("aiThreads")
			.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
			.unique();
		if (!metadata?.aiTeammateId) return null;

		const teammate = await ctx.db.get(metadata.aiTeammateId);
		if (!teammate) return null;

		return {
			name: teammate.name,
			systemPrompt: teammate.systemPrompt,
			model: teammate.model,
			temperature: teammate.temperature,
			enabledTools: teammate.enabledTools,
		};
	},
});

// ── Thread Title Helper (used by titling action to guard manual renames) ──

export const getThreadTitle = internalQuery({
	args: { threadId: v.string() },
	returns: v.union(v.string(), v.null()),
	handler: async (ctx, { threadId }) => {
		const metadata = await ctx.db
			.query("aiThreads")
			.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
			.unique();
		return metadata?.title ?? null;
	},
});

// ── Workspace Lookup for Tools (resolves workspaceId from threadId) ──────

export const getWorkspaceForThread = internalQuery({
	args: { threadId: v.string() },
	returns: v.union(v.id("workspaces"), v.null()),
	handler: async (ctx, { threadId }) => {
		const metadata = await ctx.db
			.query("aiThreads")
			.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
			.unique();
		return metadata?.workspaceId ?? null;
	},
});

// ── Get Messages Query (smoke-test utility) ──────────────────────────────

export const getMessages = query({
	args: { threadId: v.string() },
	returns: v.array(vMessageDoc),
	handler: async (ctx, { threadId }) => {
		await requireThreadOwnership(ctx, threadId);
		const result = await listMessages(ctx, components.agent, {
			threadId,
			paginationOpts: { numItems: 100, cursor: null },
		});
		// Filter out orphaned tool messages (tool calls without responses and vice versa)
		return filterOutOrphanedToolMessages(result.page);
	},
});

// ── List Thread Messages (streaming-aware, for useUIMessages hook) ────────

export const listThreadMessages = query({
	args: {
		threadId: v.string(),
		paginationOpts: paginationOptsValidator,
		streamArgs: vStreamArgs,
	},
	// listUIMessages returns AI SDK UIMessage (no Convex validator available)
	returns: v.any(),
	handler: async (ctx, { threadId, paginationOpts, streamArgs }) => {
		await requireThreadOwnership(ctx, threadId);
		const paginated = await listUIMessages(ctx, components.agent, {
			threadId,
			paginationOpts,
		});
		const streams = await syncStreams(ctx, components.agent, {
			threadId,
			streamArgs,
		});
		return { ...paginated, streams };
	},
});
