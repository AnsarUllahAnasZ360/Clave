import { ConvexError, v } from "convex/values";
import { internal } from "../_generated/api";
import {
	internalMutation,
	internalQuery,
	mutation,
	query,
} from "../_generated/server";
import { requireWorkspaceMember } from "../lib/auth";

const skillReturnValidator = v.object({
	_id: v.id("skills"),
	_creationTime: v.number(),
	workspaceId: v.id("workspaces"),
	name: v.string(),
	description: v.string(),
	category: v.string(),
	markdownContent: v.string(),
	isEnabled: v.boolean(),
	createdBy: v.id("users"),
	updatedAt: v.number(),
	sourceProvider: v.optional(v.string()),
	sourceRepo: v.optional(v.string()),
	sourceSkillId: v.optional(v.string()),
	sourceUrl: v.optional(v.string()),
});

// ── Queries ────────────────────────────────────────────────────────────────

export const list = query({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(skillReturnValidator),
	handler: async (ctx, args) => {
		await requireWorkspaceMember(ctx, args.workspaceId);
		return await ctx.db
			.query("skills")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
	},
});

export const get = query({
	args: {
		skillId: v.id("skills"),
	},
	returns: skillReturnValidator,
	handler: async (ctx, args) => {
		const skill = await ctx.db.get(args.skillId);
		if (!skill) throw new ConvexError("Skill not found");
		await requireWorkspaceMember(ctx, skill.workspaceId);
		return skill;
	},
});

// ── Mutations ──────────────────────────────────────────────────────────────

export const create = mutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.string(),
		description: v.string(),
		category: v.string(),
		markdownContent: v.string(),
		sourceProvider: v.optional(v.string()),
		sourceRepo: v.optional(v.string()),
		sourceSkillId: v.optional(v.string()),
		sourceUrl: v.optional(v.string()),
	},
	returns: v.id("skills"),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		// Check name uniqueness within workspace
		const existing = await ctx.db
			.query("skills")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();
		if (existing.some((s) => s.name === args.name)) {
			throw new ConvexError("A skill with this name already exists");
		}

		return await ctx.db.insert("skills", {
			workspaceId: args.workspaceId,
			name: args.name,
			description: args.description,
			category: args.category,
			markdownContent: args.markdownContent,
			isEnabled: true,
			createdBy: userId,
			updatedAt: Date.now(),
			sourceProvider: args.sourceProvider,
			sourceRepo: args.sourceRepo,
			sourceSkillId: args.sourceSkillId,
			sourceUrl: args.sourceUrl,
		});
	},
});

export const update = mutation({
	args: {
		skillId: v.id("skills"),
		name: v.optional(v.string()),
		description: v.optional(v.string()),
		category: v.optional(v.string()),
		markdownContent: v.optional(v.string()),
		isEnabled: v.optional(v.boolean()),
		sourceProvider: v.optional(v.string()),
		sourceRepo: v.optional(v.string()),
		sourceSkillId: v.optional(v.string()),
		sourceUrl: v.optional(v.string()),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const skill = await ctx.db.get(args.skillId);
		if (!skill) throw new ConvexError("Skill not found");

		const { userId, member } = await requireWorkspaceMember(
			ctx,
			skill.workspaceId,
		);

		if (skill.createdBy !== userId && member.role !== "admin") {
			throw new ConvexError("Not authorized to edit this skill");
		}

		// Check name uniqueness if name is being changed
		if (args.name !== undefined && args.name !== skill.name) {
			const existing = await ctx.db
				.query("skills")
				.withIndex("by_workspace", (q) =>
					q.eq("workspaceId", skill.workspaceId),
				)
				.collect();
			if (
				existing.some((s) => s._id !== args.skillId && s.name === args.name)
			) {
				throw new ConvexError("A skill with this name already exists");
			}
		}

		const patch: Record<string, unknown> = { updatedAt: Date.now() };
		if (args.name !== undefined) patch.name = args.name;
		if (args.description !== undefined) patch.description = args.description;
		if (args.category !== undefined) patch.category = args.category;
		if (args.markdownContent !== undefined)
			patch.markdownContent = args.markdownContent;
		if (args.isEnabled !== undefined) patch.isEnabled = args.isEnabled;
		if (args.sourceProvider !== undefined)
			patch.sourceProvider = args.sourceProvider;
		if (args.sourceRepo !== undefined) patch.sourceRepo = args.sourceRepo;
		if (args.sourceSkillId !== undefined)
			patch.sourceSkillId = args.sourceSkillId;
		if (args.sourceUrl !== undefined) patch.sourceUrl = args.sourceUrl;

		await ctx.db.patch(args.skillId, patch);
		return null;
	},
});

export const upsertImportedFromCatalog = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		name: v.string(),
		description: v.string(),
		category: v.string(),
		markdownContent: v.string(),
		sourceProvider: v.string(),
		sourceRepo: v.string(),
		sourceSkillId: v.string(),
		sourceUrl: v.string(),
	},
	returns: v.object({
		skillId: v.id("skills"),
		created: v.boolean(),
		name: v.string(),
	}),
	handler: async (ctx, args) => {
		const { userId } = await requireWorkspaceMember(ctx, args.workspaceId);

		const existingSkills = await ctx.db
			.query("skills")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", args.workspaceId))
			.collect();

		const existingImported = existingSkills.find(
			(skill) =>
				skill.sourceProvider === args.sourceProvider &&
				skill.sourceRepo === args.sourceRepo &&
				skill.sourceSkillId === args.sourceSkillId,
		);

		if (existingImported) {
			await ctx.db.patch(existingImported._id, {
				name: args.name,
				description: args.description,
				category: args.category,
				markdownContent: args.markdownContent,
				isEnabled: true,
				sourceUrl: args.sourceUrl,
				updatedAt: Date.now(),
			});
			return {
				skillId: existingImported._id,
				created: false,
				name: args.name,
			};
		}

		const normalizedName = args.name.trim();
		const hasNameCollision = existingSkills.some(
			(skill) => skill.name.toLowerCase() === normalizedName.toLowerCase(),
		);
		const safeName = hasNameCollision
			? `${normalizedName} (${args.sourceSkillId})`
			: normalizedName;

		const skillId = await ctx.db.insert("skills", {
			workspaceId: args.workspaceId,
			name: safeName,
			description: args.description,
			category: args.category,
			markdownContent: args.markdownContent,
			isEnabled: true,
			createdBy: userId,
			updatedAt: Date.now(),
			sourceProvider: args.sourceProvider,
			sourceRepo: args.sourceRepo,
			sourceSkillId: args.sourceSkillId,
			sourceUrl: args.sourceUrl,
		});

		return { skillId, created: true, name: safeName };
	},
});

export const remove = mutation({
	args: {
		skillId: v.id("skills"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const skill = await ctx.db.get(args.skillId);
		if (!skill) throw new ConvexError("Skill not found");

		const { userId, member } = await requireWorkspaceMember(
			ctx,
			skill.workspaceId,
		);

		if (skill.createdBy !== userId && member.role !== "admin") {
			throw new ConvexError("Not authorized to delete this skill");
		}

		// Cascade: delete all agentSkills bridge records for this skill
		const bridgeRecords = await ctx.db
			.query("agentSkills")
			.withIndex("by_skill", (q) => q.eq("skillId", args.skillId))
			.collect();
		for (const record of bridgeRecords) {
			await ctx.db.delete(record._id);
		}

		await ctx.db.delete(args.skillId);
		return null;
	},
});

export const toggle = mutation({
	args: {
		skillId: v.id("skills"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const skill = await ctx.db.get(args.skillId);
		if (!skill) throw new ConvexError("Skill not found");

		const { userId, member } = await requireWorkspaceMember(
			ctx,
			skill.workspaceId,
		);

		if (skill.createdBy !== userId && member.role !== "admin") {
			throw new ConvexError("Not authorized to toggle this skill");
		}

		await ctx.db.patch(args.skillId, {
			isEnabled: !skill.isEnabled,
			updatedAt: Date.now(),
		});
		return null;
	},
});

// ── Bridge Table Operations ────────────────────────────────────────────────

export const attachToAgent = mutation({
	args: {
		subAgentId: v.id("subAgents"),
		skillId: v.id("skills"),
	},
	returns: v.id("agentSkills"),
	handler: async (ctx, args) => {
		const agent = await ctx.db.get(args.subAgentId);
		if (!agent) throw new ConvexError("Sub-agent not found");

		const skill = await ctx.db.get(args.skillId);
		if (!skill) throw new ConvexError("Skill not found");

		if (agent.workspaceId !== skill.workspaceId) {
			throw new ConvexError("Agent and skill must be in the same workspace");
		}

		const { userId } = await requireWorkspaceMember(ctx, agent.workspaceId);

		// Check for duplicate attachment
		const existing = await ctx.db
			.query("agentSkills")
			.withIndex("by_agent", (q) => q.eq("subAgentId", args.subAgentId))
			.collect();
		if (existing.some((r) => r.skillId === args.skillId)) {
			throw new ConvexError("Skill is already attached to this agent");
		}

		const id = await ctx.db.insert("agentSkills", {
			subAgentId: args.subAgentId,
			skillId: args.skillId,
		});

		// Audit log
		await ctx.runMutation(internal.ai.auditLog.logAction, {
			workspaceId: agent.workspaceId,
			userId,
			subAgentId: args.subAgentId,
			action: "skill_attach",
			details: `Attached skill "${skill.name}" to agent "${agent.name}"`,
		});

		return id;
	},
});

export const detachFromAgent = mutation({
	args: {
		subAgentId: v.id("subAgents"),
		skillId: v.id("skills"),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		const agent = await ctx.db.get(args.subAgentId);
		if (!agent) throw new ConvexError("Sub-agent not found");

		const { userId } = await requireWorkspaceMember(ctx, agent.workspaceId);

		const records = await ctx.db
			.query("agentSkills")
			.withIndex("by_agent", (q) => q.eq("subAgentId", args.subAgentId))
			.collect();
		const record = records.find((r) => r.skillId === args.skillId);
		if (!record) throw new ConvexError("Skill is not attached to this agent");

		await ctx.db.delete(record._id);

		// Audit log
		const skill = await ctx.db.get(args.skillId);
		await ctx.runMutation(internal.ai.auditLog.logAction, {
			workspaceId: agent.workspaceId,
			userId,
			subAgentId: args.subAgentId,
			action: "skill_detach",
			details: `Detached skill "${skill?.name ?? "unknown"}" from agent "${agent.name}"`,
		});

		return null;
	},
});

export const listByAgent = query({
	args: {
		subAgentId: v.id("subAgents"),
	},
	returns: v.array(skillReturnValidator),
	handler: async (ctx, args) => {
		const agent = await ctx.db.get(args.subAgentId);
		if (!agent) throw new ConvexError("Sub-agent not found");

		await requireWorkspaceMember(ctx, agent.workspaceId);

		const bridgeRecords = await ctx.db
			.query("agentSkills")
			.withIndex("by_agent", (q) => q.eq("subAgentId", args.subAgentId))
			.collect();

		const skills = [];
		for (const record of bridgeRecords) {
			const skill = await ctx.db.get(record.skillId);
			if (skill) skills.push(skill);
		}
		return skills;
	},
});

export const listAgentsBySkill = query({
	args: {
		skillId: v.id("skills"),
	},
	returns: v.array(v.id("subAgents")),
	handler: async (ctx, args) => {
		const skill = await ctx.db.get(args.skillId);
		if (!skill) throw new ConvexError("Skill not found");

		await requireWorkspaceMember(ctx, skill.workspaceId);

		const bridgeRecords = await ctx.db
			.query("agentSkills")
			.withIndex("by_skill", (q) => q.eq("skillId", args.skillId))
			.collect();

		return bridgeRecords.map((r) => r.subAgentId);
	},
});

// ── Internal Queries (server-to-server, called from actions via ctx.runQuery) ──

/** Load all enabled skills for a workspace. No auth check — caller must validate. */
export const listEnabled = internalQuery({
	args: {
		workspaceId: v.id("workspaces"),
	},
	returns: v.array(skillReturnValidator),
	handler: async (ctx, args) => {
		return await ctx.db
			.query("skills")
			.withIndex("by_workspace_enabled", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("isEnabled", true),
			)
			.collect();
	},
});

/** Load specific skills by ID. No auth check — caller must validate. */
export const listByIds = internalQuery({
	args: {
		skillIds: v.array(v.id("skills")),
	},
	returns: v.array(skillReturnValidator),
	handler: async (ctx, args) => {
		const skills = [];
		for (const id of args.skillIds) {
			const skill = await ctx.db.get(id);
			if (skill) skills.push(skill);
		}
		return skills;
	},
});

/** Load all skills attached to a sub-agent. No auth check — caller must validate. */
export const listByAgentInternal = internalQuery({
	args: {
		subAgentId: v.id("subAgents"),
	},
	returns: v.array(skillReturnValidator),
	handler: async (ctx, args) => {
		const bridgeRecords = await ctx.db
			.query("agentSkills")
			.withIndex("by_agent", (q) => q.eq("subAgentId", args.subAgentId))
			.collect();

		const skills = [];
		for (const record of bridgeRecords) {
			const skill = await ctx.db.get(record.skillId);
			if (skill) skills.push(skill);
		}
		return skills;
	},
});
