/**
 * Demo Workspace Seed Orchestrator
 *
 * Chains seeding phases via ctx.scheduler.runAfter to stay within
 * Convex mutation time limits. Each phase handles ~200 records max.
 */

import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import {
	DEMO_AI_ASSISTANT_CHARACTERISTICS,
	DEMO_AI_WORKSPACE_CONTEXT,
	DEMO_CUSTOM_STATUSES,
	DEMO_CUSTOM_TYPES,
	DEMO_EXPIRES_DAYS,
	DEMO_ISSUE_PREFIX,
	DEMO_LABELS,
	DEMO_SLASH_COMMANDS,
	DEMO_STORY_PREFIX,
	DEMO_TASK_PREFIX,
	DEMO_USERS,
	daysAgo,
	daysFromNow,
} from "./constants";

// ── Phase 1: Seed Demo Data into Existing Workspace ─────────────────────────

export const seedDemoData = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		creatorUserId: v.id("users"),
	},
	handler: async (ctx, { workspaceId, creatorUserId }) => {
		// Idempotency: check if this workspace is already seeded
		const workspace = await ctx.db.get(workspaceId);
		if (!workspace) return;
		if (
			workspace.demoSeedStatus === "seeding" ||
			workspace.demoSeedStatus === "complete"
		)
			return;

		// Mark workspace as seeding
		await ctx.db.patch(workspaceId, {
			isDemo: true,
			demoExpiresAt: daysFromNow(DEMO_EXPIRES_DAYS),
			demoSeedStatus: "seeding",
			updatedAt: Date.now(),
		});

		// Create workspace settings if not already present
		const existingSettings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.first();
		if (!existingSettings) {
			await ctx.db.insert("workspaceSettings", {
				workspaceId,
				storyPrefix: DEMO_STORY_PREFIX,
				nextStoryNumber: 1,
				taskPrefix: DEMO_TASK_PREFIX,
				nextTaskNumber: 1,
				issuePrefix: DEMO_ISSUE_PREFIX,
				nextIssueNumber: 1,
				aiWorkspaceContext: DEMO_AI_WORKSPACE_CONTEXT,
				aiAssistantCharacteristics: DEMO_AI_ASSISTANT_CHARACTERISTICS,
				customTypes: DEMO_CUSTOM_TYPES,
				customStatuses: DEMO_CUSTOM_STATUSES,
				workspaceSlashCommands: DEMO_SLASH_COMMANDS,
			});
		}

		// Create demo users and add them as workspace members
		const userIds: Id<"users">[] = [];
		for (const user of DEMO_USERS) {
			// Check if demo user already exists
			const existingUser = await ctx.db
				.query("users")
				.withIndex("email", (q) => q.eq("email", user.email))
				.first();

			let userId: Id<"users">;
			if (existingUser) {
				userId = existingUser._id;
			} else {
				userId = await ctx.db.insert("users", {
					name: user.name,
					email: user.email,
					image: user.image,
					role: user.role,
					timezone: user.timezone,
					isDemoUser: true,
					theme: "dark",
				});
			}
			userIds.push(userId);

			// Add to workspace
			const existingWsMember = await ctx.db
				.query("workspaceMembers")
				.withIndex("by_workspace_user", (q) =>
					q.eq("workspaceId", workspaceId).eq("userId", userId),
				)
				.first();
			if (!existingWsMember) {
				await ctx.db.insert("workspaceMembers", {
					workspaceId,
					userId,
					role: "member",
					joinedAt: daysAgo(Math.floor(Math.random() * 60) + 30),
				});
			}
		}

		// Create labels
		const labelIds: Id<"labels">[] = [];
		for (let i = 0; i < DEMO_LABELS.length; i++) {
			const label = DEMO_LABELS[i];
			const labelId = await ctx.db.insert("labels", {
				workspaceId,
				name: label.name,
				color: label.color,
				description: label.description,
				sortOrder: i,
				createdBy: creatorUserId,
				createdAt: daysAgo(60),
			});
			labelIds.push(labelId);
		}

		// Schedule Phase 2: Projects
		await ctx.scheduler.runAfter(
			0,
			internal.demo.seedProjects.seedAllProjects,
			{
				workspaceId,
				creatorUserId,
				userIds: [creatorUserId, ...userIds],
				labelIds,
			},
		);
	},
});

/**
 * @deprecated Use seedDemoData instead. Kept temporarily for backward compatibility
 * with any existing scheduled jobs that reference this name.
 */
export const initDemoWorkspace = seedDemoData;

// ── Finalize: Mark seeding complete ──────────────────────────────────────────

export const finalizeDemoSeed = internalMutation({
	args: {
		workspaceId: v.id("workspaces"),
		totalIssues: v.number(),
		totalTasks: v.number(),
	},
	handler: async (ctx, { workspaceId, totalIssues, totalTasks }) => {
		// Update workspace seed status
		await ctx.db.patch(workspaceId, {
			demoSeedStatus: "complete",
			updatedAt: Date.now(),
		});

		// Update counters in workspace settings
		const settings = await ctx.db
			.query("workspaceSettings")
			.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
			.first();

		if (settings) {
			await ctx.db.patch(settings._id, {
				nextIssueNumber: totalIssues + 1,
				nextTaskNumber: totalTasks + 1,
			});
		}
	},
});
