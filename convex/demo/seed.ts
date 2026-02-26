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
	DEMO_WORKSPACE_DESCRIPTION,
	DEMO_WORKSPACE_NAME,
	DEMO_WORKSPACE_SLUG,
	daysAgo,
	daysFromNow,
} from "./constants";

// ── Phase 1: Initialize Demo Workspace ───────────────────────────────────────

export const initDemoWorkspace = internalMutation({
	args: {
		organizationId: v.id("organizations"),
		creatorUserId: v.id("users"),
	},
	handler: async (ctx, { organizationId, creatorUserId }) => {
		// Idempotency: check if demo workspace already exists for this org
		const existing = await ctx.db
			.query("workspaces")
			.withIndex("by_organization", (q) =>
				q.eq("organizationId", organizationId),
			)
			.filter((q) => q.eq(q.field("isDemo"), true))
			.first();
		if (existing) return;

		// Create the demo workspace
		const workspaceId = await ctx.db.insert("workspaces", {
			name: DEMO_WORKSPACE_NAME,
			slug: `${DEMO_WORKSPACE_SLUG}-${organizationId.slice(-6)}`,
			ownerId: creatorUserId,
			organizationId,
			visibility: "public",
			description: DEMO_WORKSPACE_DESCRIPTION,
			isDemo: true,
			demoExpiresAt: daysFromNow(DEMO_EXPIRES_DAYS),
			demoSeedStatus: "seeding",
			createdAt: Date.now(),
			updatedAt: Date.now(),
		});

		// Create workspace settings
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

		// Add creator as workspace admin
		await ctx.db.insert("workspaceMembers", {
			workspaceId,
			userId: creatorUserId,
			role: "admin",
			joinedAt: Date.now(),
		});

		// Create demo users and add them as workspace + org members
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

			// Add to org
			const existingOrgMember = await ctx.db
				.query("organizationMembers")
				.withIndex("by_org_user", (q) =>
					q.eq("organizationId", organizationId).eq("userId", userId),
				)
				.first();
			if (!existingOrgMember) {
				await ctx.db.insert("organizationMembers", {
					organizationId,
					userId,
					role: "member",
					joinedAt: daysAgo(Math.floor(Math.random() * 60) + 30),
				});
			}

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
				organizationId,
				creatorUserId,
				userIds: [creatorUserId, ...userIds],
				labelIds,
			},
		);
	},
});

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
