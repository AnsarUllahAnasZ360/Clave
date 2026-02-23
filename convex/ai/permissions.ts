/**
 * Permission gating helpers for sub-agents and skills.
 *
 * Enforces the ownership model:
 * - Personal (not shared): only createdBy can edit/delete
 * - Shared: only workspace admins can edit/delete
 * - Preset: nobody can edit/delete (system-managed)
 * - Invoke/use: any workspace member
 *
 * @see STORY-024 for design context
 */

import { ConvexError } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { requireWorkspaceMember } from "../lib/auth";

// ── Sub-Agent Permission ──────────────────────────────────────────────────

/**
 * Check if the current user has permission to perform an action on a sub-agent.
 * - invoke: any workspace member
 * - edit/delete personal: only createdBy
 * - edit/delete shared: only workspace admin
 * - edit/delete preset: nobody (throws)
 */
export async function requireAgentPermission(
	ctx: QueryCtx | MutationCtx,
	agentId: Id<"subAgents">,
	action: "edit" | "delete" | "invoke",
): Promise<{ userId: Id<"users">; workspaceId: Id<"workspaces"> }> {
	const agent = await ctx.db.get(agentId);
	if (!agent) throw new ConvexError("Sub-agent not found");

	const { userId, member } = await requireWorkspaceMember(
		ctx,
		agent.workspaceId,
	);

	// Invoke: any workspace member can invoke any agent
	if (action === "invoke") {
		return { userId, workspaceId: agent.workspaceId };
	}

	// Preset agents cannot be edited or deleted by anyone
	if (agent.isPreset) {
		throw new ConvexError("Preset agents cannot be modified");
	}

	// Shared agents: only admins can edit/delete
	if (agent.isShared) {
		if (member.role !== "admin") {
			throw new ConvexError(
				`Only workspace admins can ${action} shared agents`,
			);
		}
		return { userId, workspaceId: agent.workspaceId };
	}

	// Personal agents: only the creator can edit/delete
	if (agent.createdBy !== userId) {
		throw new ConvexError(`Only the creator can ${action} this personal agent`);
	}

	return { userId, workspaceId: agent.workspaceId };
}

// ── Skill Permission ──────────────────────────────────────────────────────

/**
 * Check if the current user has permission to perform an action on a skill.
 * - use: any workspace member
 * - edit/delete: creator or workspace admin
 */
export async function requireSkillPermission(
	ctx: QueryCtx | MutationCtx,
	skillId: Id<"skills">,
	action: "edit" | "delete" | "use",
): Promise<{ userId: Id<"users">; workspaceId: Id<"workspaces"> }> {
	const skill = await ctx.db.get(skillId);
	if (!skill) throw new ConvexError("Skill not found");

	const { userId, member } = await requireWorkspaceMember(
		ctx,
		skill.workspaceId,
	);

	// Use: any workspace member
	if (action === "use") {
		return { userId, workspaceId: skill.workspaceId };
	}

	// Edit/delete: creator or admin
	if (skill.createdBy !== userId && member.role !== "admin") {
		throw new ConvexError(`Not authorized to ${action} this skill`);
	}

	return { userId, workspaceId: skill.workspaceId };
}
