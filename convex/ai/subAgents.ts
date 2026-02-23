import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import { internalQuery, mutation, query } from "../_generated/server";
import { requireWorkspaceMember } from "../lib/auth";
import { requireAgentPermission } from "./permissions";
import { sanitizeInstructions } from "./sanitizeInstructions";

const ragContentTypeValidator = v.union(
	v.literal("issue"),
	v.literal("document"),
	v.literal("comment"),
	v.literal("github_file"),
);

const subAgentReturnValidator = v.object({
	_id: v.id("subAgents"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	name: v.string(),
	description: v.string(),
	avatar: v.optional(v.string()),
	instructions: v.string(),
	model: v.optional(v.string()),
	enabledTools: v.optional(v.array(v.string())),
	ragContentTypes: v.optional(v.array(ragContentTypeValidator)),
	isShared: v.boolean(),
	isPreset: v.boolean(),
	createdBy: v.id("users"),
	updatedAt: v.number(),
});

// ── Queries ────────────────────────────────────────────────────────────────

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(subAgentReturnValidator),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);
		const agents = await ctx.db
			.query("subAgents")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		return agents.filter((a) => a.isShared || a.createdBy === userId);
	},
});

export const get = query({
	args: {
		id: v.id("subAgents"),
	},
	returns: subAgentReturnValidator,
	handler: async (ctx, args) => {
		const agent = await ctx.db.get(args.id);
		if (!agent) throw new ConvexError("Sub-agent not found");
		await requireWorkspaceMember(ctx, agent.workspaceId);
		return agent;
	},
});

/**
 * Internal query for server-to-server access (e.g., workflow steps).
 * Bypasses auth since internal functions are not exposed publicly.
 */
export const getInternal = internalQuery({
	args: { id: v.id("subAgents") },
	returns: v.union(subAgentReturnValidator, v.null()),
	handler: async (ctx, args) => {
		return await ctx.db.get(args.id);
	},
});

// ── Mutations ──────────────────────────────────────────────────────────────

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.string(),
		description: v.string(),
		avatar: v.optional(v.string()),
		instructions: v.string(),
		model: v.optional(v.string()),
		enabledTools: v.optional(v.array(v.string())),
		ragContentTypes: v.optional(v.array(ragContentTypeValidator)),
		isShared: v.boolean(),
	},
	returns: v.id("subAgents"),
	handler: async (ctx, args) => {
		const { userId, member } = await requireWorkspaceMember(
			ctx,
			args.workspaceId,
		);

		if (args.isShared && member.role !== "admin") {
			throw new ConvexError("Only admins can create shared agents");
		}

		// Sanitize instructions for prompt injection
		const sanitized = sanitizeInstructions(args.instructions);
		if (!sanitized.valid) {
			throw new ConvexError(
				`Invalid instructions: ${sanitized.warnings.join(", ")}`,
			);
		}

		const agentId = await ctx.db.insert("subAgents", {
			workspaceId: args.workspaceId,
			name: args.name,
			description: args.description,
			avatar: args.avatar,
			instructions: sanitized.sanitized,
			model: args.model,
			enabledTools: args.enabledTools,
			ragContentTypes: args.ragContentTypes,
			isShared: args.isShared,
			isPreset: false,
			createdBy: userId,
			updatedAt: Date.now(),
		});

		// Audit log
		await ctx.runMutation(internal.ai.auditLog.logAction, {
			workspaceId: args.workspaceId,
			userId,
			subAgentId: agentId,
			action: "sub_agent_create",
			details: `Created agent "${args.name}"`,
		});

		return agentId;
	},
});

export const update = mutation({
	args: {
		id: v.id("subAgents"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		avatar: v.optional(v.string()),
		instructions: v.optional(v.string()),
		model: v.optional(v.string()),
		enabledTools: v.optional(v.array(v.string())),
		ragContentTypes: v.optional(v.array(ragContentTypeValidator)),
		isShared: v.optional(v.boolean()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		// Permission gating: checks preset, shared, personal ownership
		const { userId } = await requireAgentPermission(ctx, args.id, "edit");

		const agent = await ctx.db.get(args.id);
		if (!agent) throw new ConvexError("Sub-agent not found");

		const { member } = await requireWorkspaceMember(ctx, agent.workspaceId);

		if (args.isShared === true && member.role !== "admin") {
			throw new ConvexError("Only admins can make agents shared");
		}

		// Sanitize instructions if being updated
		if (args.instructions !== undefined) {
			const sanitized = sanitizeInstructions(args.instructions);
			if (!sanitized.valid) {
				throw new ConvexError(
					`Invalid instructions: ${sanitized.warnings.join(", ")}`,
				);
			}
		}

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) patch.name = args.name;
		if (args.description !== undefined) patch.description = args.description;
		if (args.avatar !== undefined) patch.avatar = args.avatar;
		if (args.instructions !== undefined) patch.instructions = args.instructions;
		if (args.model !== undefined) patch.model = args.model;
		if (args.enabledTools !== undefined) patch.enabledTools = args.enabledTools;
		if (args.ragContentTypes !== undefined)
			patch.ragContentTypes = args.ragContentTypes;
		if (args.isShared !== undefined) patch.isShared = args.isShared;

		await ctx.db.patch(args.id, patch);

		// Audit log
		await ctx.runMutation(internal.ai.auditLog.logAction, {
			workspaceId: agent.workspaceId,
			userId,
			subAgentId: args.id,
			action: "sub_agent_update",
			details: `Updated agent "${agent.name}"`,
		});

		return null;
	},
});

export const remove = mutation({
	args: {
		id: v.id("subAgents"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		// Permission gating: checks preset, shared, personal ownership
		const { userId, workspaceId } = await requireAgentPermission(
			ctx,
			args.id,
			"delete",
		);

		const agent = await ctx.db.get(args.id);
		if (!agent) throw new ConvexError("Sub-agent not found");

		await ctx.db.delete(args.id);

		// Audit log
		await ctx.runMutation(internal.ai.auditLog.logAction, {
			workspaceId,
			userId,
			subAgentId: args.id,
			action: "sub_agent_delete",
			details: `Deleted agent "${agent.name}"`,
		});

		return null;
	},
});
