import {
	createThread as agentCreateThread,
	listMessages,
	updateThreadMetadata,
} from "@convex-dev/agent";
import { paginationOptsValidator } from "convex/server";
import { ConvexError, v } from "convex/values";
import { components } from "../_generated/api";
import { internalMutation, mutation, query } from "../_generated/server";
import { requireWorkspaceMember } from "../lib/auth";
import { normalizeChatModelId } from "./modelIds";

// ── Create Thread ───────────────────────────────────────────────────────────

export const createThread = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		title: v.optional(v.string()),
		model: v.optional(v.string()),
		aiTeammateId: v.optional(v.id("aiTeammates")),
		selectedMcpServerIds: v.optional(v.array(v.id("mcpServers"))),
	},
	returns: v.object({
		threadId: v.string(),
		metadataId: v.id("aiThreads"),
	}),
	handler: async (
		ctx,
		{ workspaceId, title, model, aiTeammateId, selectedMcpServerIds },
	) => {
		const { userId } = await requireWorkspaceMember(ctx, workspaceId);

		// Create thread in agent component (standalone function, V8 compatible)
		const threadId = await agentCreateThread(ctx, components.agent, {
			userId,
			title,
		});

		const normalizedModel = normalizeChatModelId(model);
		// Insert application-level metadata for workspace scoping + ordering
		const now = Date.now();
		const metadataId = await ctx.db.insert("aiThreads", {
			workspaceId,
			userId,
			threadId,
			model: normalizedModel,
			title,
			...(aiTeammateId && { aiTeammateId }),
			...(selectedMcpServerIds && { selectedMcpServerIds }),
			updatedAt: now,
		});

		return { threadId, metadataId };
	},
});

// ── Create Incognito Thread ──────────────────────────────────────────────────

export const createIncognitoThread = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		model: v.optional(v.string()),
		selectedMcpServerIds: v.optional(v.array(v.id("mcpServers"))),
	},
	returns: v.object({
		threadId: v.string(),
		metadataId: v.id("aiThreads"),
	}),
	handler: async (ctx, { workspaceId, model, selectedMcpServerIds }) => {
		const { userId } = await requireWorkspaceMember(ctx, workspaceId);

		const threadId = await agentCreateThread(ctx, components.agent, {
			userId,
			title: "Incognito chat",
		});

		const normalizedModel = normalizeChatModelId(model);
		const now = Date.now();
		const metadataId = await ctx.db.insert("aiThreads", {
			workspaceId,
			userId,
			threadId,
			model: normalizedModel,
			title: "Incognito chat",
			...(selectedMcpServerIds && { selectedMcpServerIds }),
			isIncognito: true,
			updatedAt: now,
		});

		return { threadId, metadataId };
	},
});

// ── List Threads ────────────────────────────────────────────────────────────

export const listThreads = query({
	args: {
		workspaceId: v.id("workspaces"),
		paginationOpts: paginationOptsValidator,
	},
	handler: async (ctx, { workspaceId, paginationOpts }) => {
		const { userId } = await requireWorkspaceMember(ctx, workspaceId);

		const result = await ctx.db
			.query("aiThreads")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", workspaceId).eq("userId", userId),
			)
			.order("desc")
			.paginate(paginationOpts);

		return {
			...result,
			page: result.page.filter((t) => !t.isIncognito),
		};
	},
});

// ── Get Thread Metadata ─────────────────────────────────────────────────────

export const getThreadMetadata = query({
	args: {
		threadId: v.string(),
	},
	handler: async (ctx, { threadId }) => {
		const metadata = await ctx.db
			.query("aiThreads")
			.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
			.unique();

		return metadata;
	},
});

// ── Delete Thread ───────────────────────────────────────────────────────────

export const deleteThread = mutation({
	args: {
		threadId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, { threadId }) => {
		// Look up the aiThreads metadata row
		const metadata = await ctx.db
			.query("aiThreads")
			.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
			.unique();

		if (!metadata) {
			throw new ConvexError("Thread not found");
		}

		// Verify ownership: only the thread creator can delete
		const { userId } = await requireWorkspaceMember(ctx, metadata.workspaceId);
		if (metadata.userId !== userId) {
			throw new ConvexError("You can only delete your own threads");
		}

		// Delete from our metadata table
		await ctx.db.delete(metadata._id);

		// Delete associated tool approvals (prevent orphaned records)
		const approvals = await ctx.db
			.query("aiToolApprovals")
			.withIndex("by_thread", (q) => q.eq("threadId", threadId))
			.collect();
		for (const approval of approvals) {
			await ctx.db.delete(approval._id);
		}

		// Delete from agent component (async, non-blocking)
		await ctx.runMutation(components.agent.threads.deleteAllForThreadIdAsync, {
			threadId,
		});

		return null;
	},
});

// ── Rename Thread ───────────────────────────────────────────────────────────

export const renameThread = mutation({
	args: {
		threadId: v.string(),
		title: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, { threadId, title }) => {
		// Look up the aiThreads metadata row
		const metadata = await ctx.db
			.query("aiThreads")
			.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
			.unique();

		if (!metadata) {
			throw new ConvexError("Thread not found");
		}

		// Verify ownership
		const { userId } = await requireWorkspaceMember(ctx, metadata.workspaceId);
		if (metadata.userId !== userId) {
			throw new ConvexError("You can only rename your own threads");
		}

		// Update our metadata
		await ctx.db.patch(metadata._id, { title });

		// Sync title to agent component metadata
		await updateThreadMetadata(ctx, components.agent, {
			threadId,
			patch: { title },
		});

		return null;
	},
});

// ── Update Thread Model ─────────────────────────────────────────────────────

export const updateThreadModel = mutation({
	args: {
		threadId: v.string(),
		model: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, { threadId, model }) => {
		const metadata = await ctx.db
			.query("aiThreads")
			.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
			.unique();

		if (!metadata) {
			throw new ConvexError("Thread not found");
		}

		const { userId } = await requireWorkspaceMember(ctx, metadata.workspaceId);
		if (metadata.userId !== userId) {
			throw new ConvexError("You can only update your own threads");
		}

		const normalizedModel = normalizeChatModelId(model);
		await ctx.db.patch(metadata._id, { model: normalizedModel });
		return null;
	},
});

// ── Update Thread MCP Server Selection ──────────────────────────────────────

export const updateThreadMcpServers = mutation({
	args: {
		threadId: v.string(),
		selectedMcpServerIds: v.array(v.id("mcpServers")),
	},
	returns: v.null(),
	handler: async (ctx, { threadId, selectedMcpServerIds }) => {
		const metadata = await ctx.db
			.query("aiThreads")
			.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
			.unique();

		if (!metadata) {
			throw new ConvexError("Thread not found");
		}

		const { userId } = await requireWorkspaceMember(ctx, metadata.workspaceId);
		if (metadata.userId !== userId) {
			throw new ConvexError("You can only update your own threads");
		}
		const activeServers = await ctx.db
			.query("mcpServers")
			.withIndex("by_workspace", (q) =>
				q.eq("workspaceId", metadata.workspaceId),
			)
			.collect();
		const activeServerIds = new Set(
			activeServers
				.filter((server) => server.status === "active" && !server.deletedAt)
				.map((server) => server._id),
		);
		const normalizedSelectedServerIds = [
			...new Set(selectedMcpServerIds),
		].filter((id) => activeServerIds.has(id));

		await ctx.db.patch(metadata._id, {
			selectedMcpServerIds: normalizedSelectedServerIds,
			updatedAt: Date.now(),
		});
		return null;
	},
});

// ── Sync Thread Model (internal) ────────────────────────────────────────

export const syncThreadModel = internalMutation({
	args: {
		threadId: v.string(),
		model: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, { threadId, model }) => {
		const metadata = await ctx.db
			.query("aiThreads")
			.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
			.unique();

		if (!metadata) return null;

		const normalizedModel = normalizeChatModelId(model);
		if (metadata.model !== normalizedModel) {
			await ctx.db.patch(metadata._id, { model: normalizedModel });
		}
		return null;
	},
});

// ── Internal Mutations (for chat.ts action to call) ─────────────────────────

/** Create aiThreads row when sendMessage creates a new agent thread */
export const insertThreadMetadata = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		userId: v.id("users"),
		threadId: v.string(),
		model: v.optional(v.string()),
		aiTeammateId: v.optional(v.id("aiTeammates")),
		selectedMcpServerIds: v.optional(v.array(v.id("mcpServers"))),
	},
	returns: v.id("aiThreads"),
	handler: async (
		ctx,
		{
			workspaceId,
			userId,
			threadId,
			model,
			aiTeammateId,
			selectedMcpServerIds,
		},
	) => {
		const normalizedModel = model ? normalizeChatModelId(model) : undefined;
		return await ctx.db.insert("aiThreads", {
			workspaceId,
			userId,
			threadId,
			model: normalizedModel,
			...(aiTeammateId && { aiTeammateId }),
			...(selectedMcpServerIds && { selectedMcpServerIds }),
			updatedAt: Date.now(),
		});
	},
});

/** Set thread title without auth check (called by auto-titling background action) */
export const internalSetThreadTitle = internalMutation({
	args: {
		threadId: v.string(),
		title: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, { threadId, title }) => {
		const metadata = await ctx.db
			.query("aiThreads")
			.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
			.unique();

		if (!metadata) return null;

		await ctx.db.patch(metadata._id, { title, updatedAt: Date.now() });

		// Sync title to agent component metadata
		await updateThreadMetadata(ctx, components.agent, {
			threadId,
			patch: { title },
		});

		return null;
	},
});

/** Clean up incognito threads older than 24 hours */
export const cleanupIncognitoThreads = internalMutation({
	args: {},
	returns: v.number(),
	handler: async (ctx) => {
		const twentyFourHoursAgo = Date.now() - 24 * 60 * 60 * 1000;

		// Query all incognito threads (scan the table — volume is low)
		const incognitoThreads = await ctx.db
			.query("aiThreads")
			.filter((q) => q.eq(q.field("isIncognito"), true))
			.collect();

		let deleted = 0;
		for (const thread of incognitoThreads) {
			if (thread.updatedAt < twentyFourHoursAgo) {
				// Delete associated tool approvals
				const approvals = await ctx.db
					.query("aiToolApprovals")
					.withIndex("by_thread", (q) => q.eq("threadId", thread.threadId))
					.collect();
				for (const approval of approvals) {
					await ctx.db.delete(approval._id);
				}

				// Delete from agent component
				await ctx.runMutation(
					components.agent.threads.deleteAllForThreadIdAsync,
					{ threadId: thread.threadId },
				);

				// Delete metadata row
				await ctx.db.delete(thread._id);
				deleted++;
			}
		}

		return deleted;
	},
});

// ── Search Threads (title + message content) ────────────────────────────────

/** Helper to extract plain text from an agent message doc */
function extractMessageText(msg: {
	text?: string;
	message?: { role: string; content: unknown };
}): string {
	// The `text` field is the flattened text content (set by the agent lib)
	if (msg.text) return msg.text;
	// Fallback: extract from message.content if it's a string
	if (msg.message && typeof msg.message.content === "string") {
		return msg.message.content;
	}
	return "";
}

export const searchThreads = query({
	args: {
		workspaceId: v.id("workspaces"),
		query: v.string(),
	},
	handler: async (ctx, { workspaceId, query: searchQuery }) => {
		const { userId } = await requireWorkspaceMember(ctx, workspaceId);
		const trimmed = searchQuery.trim().toLowerCase();
		if (!trimmed) return [];

		// Fetch all user threads in this workspace (most recent first)
		const allThreads = await ctx.db
			.query("aiThreads")
			.withIndex("by_workspace_user", (q) =>
				q.eq("workspaceId", workspaceId).eq("userId", userId),
			)
			.order("desc")
			.collect();

		const visibleThreads = allThreads.filter((t) => !t.isIncognito);

		// Phase 1: title matches (fast)
		const titleMatches = new Set<string>();
		const results: typeof visibleThreads = [];
		for (const thread of visibleThreads) {
			if (thread.title?.toLowerCase().includes(trimmed)) {
				titleMatches.add(thread.threadId);
				results.push(thread);
			}
		}

		// Phase 2: message content matches (check threads not already matched)
		// Limit to first 50 threads to keep query fast
		const candidateThreads = visibleThreads
			.filter((t) => !titleMatches.has(t.threadId))
			.slice(0, 50);

		for (const thread of candidateThreads) {
			const messagesResult = await listMessages(ctx, components.agent, {
				threadId: thread.threadId,
				paginationOpts: { numItems: 20, cursor: null },
			});

			const hasMatch = messagesResult.page.some((msg) => {
				const text = extractMessageText(msg);
				return text.toLowerCase().includes(trimmed);
			});

			if (hasMatch) {
				results.push(thread);
			}
		}

		// Sort by updatedAt descending (most recent first)
		results.sort((a, b) => b.updatedAt - a.updatedAt);

		return results;
	},
});

/** Update aiThreads.updatedAt when a message is sent to an existing thread */
export const touchThread = internalMutation({
	args: {
		threadId: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, { threadId }) => {
		const metadata = await ctx.db
			.query("aiThreads")
			.withIndex("by_thread_id", (q) => q.eq("threadId", threadId))
			.unique();

		if (metadata) {
			await ctx.db.patch(metadata._id, { updatedAt: Date.now() });
		}

		return null;
	},
});
