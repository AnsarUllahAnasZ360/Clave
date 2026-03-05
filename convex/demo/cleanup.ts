/**
 * Demo Workspace Cleanup
 *
 * Hard-deletes expired demo workspaces and all associated data.
 * Runs daily via cron. Follows the cascade-delete pattern from devSeed.ts clearSeed.
 */

import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { internalMutation } from "../_generated/server";

/** Delete all records from a table that has a "by_workspace" index */
async function deleteByWorkspace(
	ctx: MutationCtx,
	table:
		| "labels"
		| "stories"
		| "activityLogs"
		| "files"
		| "aiTeammates"
		| "skills"
		| "mcpServers"
		| "workspacePresence",
	workspaceId: Id<"workspaces">,
) {
	const records = await ctx.db
		.query(table)
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	for (const record of records) {
		await ctx.db.delete(record._id);
	}
	return records;
}

/** Clean up expired demo workspaces — called by cron daily */
export const cleanupExpiredDemos = internalMutation({
	args: {},
	handler: async (ctx) => {
		const now = Date.now();

		// Find expired demo workspaces
		const expired = await ctx.db
			.query("workspaces")
			.withIndex("by_demo_expires", (q) => q.eq("isDemo", true))
			.filter((q) =>
				q.and(
					q.neq(q.field("demoExpiresAt"), undefined),
					q.lt(q.field("demoExpiresAt"), now),
				),
			)
			.collect();

		for (const workspace of expired) {
			await cleanupDemoWorkspace(ctx, workspace._id);
		}
	},
});

/** Hard-delete a demo workspace and all its data */
async function cleanupDemoWorkspace(
	ctx: MutationCtx,
	workspaceId: Id<"workspaces">,
) {
	// Delete issue-related data first (comments, relations, subscriptions)
	const issues = await ctx.db
		.query("issues")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();

	for (const issue of issues) {
		// Comments on this issue
		const comments = await ctx.db
			.query("comments")
			.withIndex("by_issue", (q) => q.eq("issueId", issue._id))
			.collect();
		for (const c of comments) await ctx.db.delete(c._id);

		// Issue relations
		const relations = await ctx.db
			.query("issueRelations")
			.withIndex("by_issue", (q) => q.eq("issueId", issue._id))
			.collect();
		for (const r of relations) await ctx.db.delete(r._id);

		const reverseRelations = await ctx.db
			.query("issueRelations")
			.withIndex("by_related_issue", (q) => q.eq("relatedIssueId", issue._id))
			.collect();
		for (const r of reverseRelations) await ctx.db.delete(r._id);

		// Issue subscriptions
		const subs = await ctx.db
			.query("issueSubscriptions")
			.withIndex("by_issue", (q) => q.eq("issueId", issue._id))
			.collect();
		for (const s of subs) await ctx.db.delete(s._id);

		await ctx.db.delete(issue._id);
	}

	// Delete document-related data
	const documents = await ctx.db
		.query("documents")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();

	for (const doc of documents) {
		const threads = await ctx.db
			.query("documentThreads")
			.withIndex("by_document", (q) => q.eq("documentId", doc._id))
			.collect();
		for (const thread of threads) {
			const threadComments = await ctx.db
				.query("documentComments")
				.withIndex("by_thread", (q) => q.eq("threadId", thread._id))
				.collect();
			for (const c of threadComments) await ctx.db.delete(c._id);
			await ctx.db.delete(thread._id);
		}

		// Yjs data
		const yjsDocs = await ctx.db
			.query("yjsDocuments")
			.withIndex("by_document", (q) => q.eq("documentId", doc._id))
			.collect();
		for (const y of yjsDocs) await ctx.db.delete(y._id);

		const yjsAwareness = await ctx.db
			.query("yjsAwareness")
			.withIndex("by_document", (q) => q.eq("documentId", doc._id))
			.collect();
		for (const y of yjsAwareness) await ctx.db.delete(y._id);

		// Document presence
		const presence = await ctx.db
			.query("documentPresence")
			.withIndex("by_document", (q) => q.eq("documentId", doc._id))
			.collect();
		for (const p of presence) await ctx.db.delete(p._id);

		await ctx.db.delete(doc._id);
	}

	// Delete whiteboard-related data
	const whiteboards = await ctx.db
		.query("whiteboards")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();

	for (const wb of whiteboards) {
		const wbComments = await ctx.db
			.query("comments")
			.withIndex("by_whiteboard", (q) => q.eq("whiteboardId", wb._id))
			.collect();
		for (const c of wbComments) await ctx.db.delete(c._id);

		const wbPresence = await ctx.db
			.query("whiteboardPresence")
			.withIndex("by_whiteboard", (q) => q.eq("whiteboardId", wb._id))
			.collect();
		for (const p of wbPresence) await ctx.db.delete(p._id);

		await ctx.db.delete(wb._id);
	}

	// Delete project-related data
	const projects = await ctx.db
		.query("projects")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();

	for (const project of projects) {
		const milestones = await ctx.db
			.query("milestones")
			.withIndex("by_project", (q) => q.eq("projectId", project._id))
			.collect();
		for (const m of milestones) await ctx.db.delete(m._id);

		const sprints = await ctx.db
			.query("sprints")
			.withIndex("by_project", (q) => q.eq("projectId", project._id))
			.collect();
		for (const s of sprints) await ctx.db.delete(s._id);

		const members = await ctx.db
			.query("projectMembers")
			.withIndex("by_project", (q) => q.eq("projectId", project._id))
			.collect();
		for (const m of members) await ctx.db.delete(m._id);

		const updates = await ctx.db
			.query("projectUpdates")
			.withIndex("by_project", (q) => q.eq("projectId", project._id))
			.collect();
		for (const u of updates) await ctx.db.delete(u._id);

		const ragSync = await ctx.db
			.query("ragSyncStatus")
			.withIndex("by_project", (q) => q.eq("projectId", project._id))
			.collect();
		for (const r of ragSync) await ctx.db.delete(r._id);

		await ctx.db.delete(project._id);
	}

	// Delete client-related data
	const clients = await ctx.db
		.query("clients")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();

	for (const client of clients) {
		const contacts = await ctx.db
			.query("clientContacts")
			.withIndex("by_client", (q) => q.eq("clientId", client._id))
			.collect();
		for (const c of contacts) await ctx.db.delete(c._id);
		await ctx.db.delete(client._id);
	}

	// Delete task comments
	const tasks = await ctx.db
		.query("tasks")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	for (const task of tasks) {
		const taskComments = await ctx.db
			.query("comments")
			.withIndex("by_task", (q) => q.eq("taskId", task._id))
			.collect();
		for (const c of taskComments) await ctx.db.delete(c._id);
		await ctx.db.delete(task._id);
	}

	// Delete agent skills
	const subAgents = await ctx.db
		.query("subAgents")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	for (const agent of subAgents) {
		const agentSkills = await ctx.db
			.query("agentSkills")
			.withIndex("by_agent", (q) => q.eq("subAgentId", agent._id))
			.collect();
		for (const as of agentSkills) await ctx.db.delete(as._id);
		await ctx.db.delete(agent._id);
	}

	// Delete remaining workspace-level tables (tables with by_workspace index)
	await deleteByWorkspace(ctx, "labels", workspaceId);
	await deleteByWorkspace(ctx, "stories", workspaceId);
	await deleteByWorkspace(ctx, "activityLogs", workspaceId);
	await deleteByWorkspace(ctx, "files", workspaceId);
	await deleteByWorkspace(ctx, "aiTeammates", workspaceId);
	await deleteByWorkspace(ctx, "skills", workspaceId);
	await deleteByWorkspace(ctx, "mcpServers", workspaceId);
	await deleteByWorkspace(ctx, "workspacePresence", workspaceId);

	// Tables without a by_workspace index — query with available indexes
	const notifications = await ctx.db
		.query("notifications")
		.filter((q) => q.eq(q.field("workspaceId"), workspaceId))
		.collect();
	for (const n of notifications) await ctx.db.delete(n._id);

	const favorites = await ctx.db
		.query("favorites")
		.filter((q) => q.eq(q.field("workspaceId"), workspaceId))
		.collect();
	for (const f of favorites) await ctx.db.delete(f._id);

	const recents = await ctx.db
		.query("recents")
		.filter((q) => q.eq(q.field("workspaceId"), workspaceId))
		.collect();
	for (const r of recents) await ctx.db.delete(r._id);

	const aiThreads = await ctx.db
		.query("aiThreads")
		.filter((q) => q.eq(q.field("workspaceId"), workspaceId))
		.collect();
	for (const t of aiThreads) await ctx.db.delete(t._id);

	const audioRecordings = await ctx.db
		.query("audioRecordings")
		.filter((q) => q.eq(q.field("workspaceId"), workspaceId))
		.collect();
	for (const a of audioRecordings) await ctx.db.delete(a._id);

	// Delete workspace settings
	const settings = await ctx.db
		.query("workspaceSettings")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	for (const s of settings) await ctx.db.delete(s._id);

	// Delete workspace members
	const wsMembers = await ctx.db
		.query("workspaceMembers")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	for (const m of wsMembers) await ctx.db.delete(m._id);

	// Delete invite codes
	const inviteCodes = await ctx.db
		.query("inviteCodes")
		.withIndex("by_workspace", (q) => q.eq("workspaceId", workspaceId))
		.collect();
	for (const ic of inviteCodes) await ctx.db.delete(ic._id);

	// Finally, delete the workspace itself
	await ctx.db.delete(workspaceId);

	// Clean up demo users that are no longer in any workspace
	const demoUsers = await ctx.db
		.query("users")
		.filter((q) => q.eq(q.field("isDemoUser"), true))
		.collect();

	for (const user of demoUsers) {
		const remainingMemberships = await ctx.db
			.query("workspaceMembers")
			.withIndex("by_user", (q) => q.eq("userId", user._id))
			.first();
		if (!remainingMemberships) {
			await ctx.db.delete(user._id);
		}
	}
}
