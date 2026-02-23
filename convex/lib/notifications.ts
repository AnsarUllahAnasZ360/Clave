import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type NotificationType =
	// Issue-centric types (preferred)
	| "issue_assigned"
	| "issue_status_changed"
	| "issue_mentioned"
	| "issue_due_soon"
	| "issue_overdue"
	| "issue_stale"
	// General types
	| "comment"
	| "project_update"
	| "client_update"
	| "system"
	// Document and whiteboard types
	| "document_update"
	| "document_comment"
	| "whiteboard_update"
	// DEPRECATED -- old story/task types kept for backward compatibility
	| "story_assigned"
	| "story_status_changed"
	| "story_mentioned"
	| "task_assigned"
	| "task_status_changed";

type NotificationReason =
	| "assigned"
	| "status_changed"
	| "mentioned"
	| "comment"
	| "update"
	| "reminder"
	| "system";

interface CreateNotificationArgs {
	userId: Id<"users">;
	workspaceId: Id<"workspaces">;
	type: NotificationType;
	eventType?: string;
	title: string;
	body?: string;
	preview?: string;
	issueId?: Id<"issues">;
	storyId?: Id<"stories">; // DEPRECATED -- use issueId
	taskId?: Id<"tasks">; // DEPRECATED -- use issueId
	projectId?: Id<"projects">;
	clientId?: Id<"clients">;
	commentId?: Id<"comments">;
	documentId?: Id<"documents">;
	whiteboardId?: Id<"whiteboards">;
	actorId?: Id<"users">;
	dedupeKey?: string;
	reason?: NotificationReason;
	source?: "mutation" | "cron" | "system";
	eventAt?: number;
	entityType?:
		| "issue"
		| "task"
		| "story"
		| "project"
		| "document"
		| "whiteboard"
		| "client"
		| "comment";
	entityId?: string;
}

function deriveReason(type: NotificationType): NotificationReason {
	if (
		type === "issue_assigned" ||
		type === "story_assigned" ||
		type === "task_assigned"
	) {
		return "assigned";
	}
	if (
		type === "issue_status_changed" ||
		type === "story_status_changed" ||
		type === "task_status_changed"
	) {
		return "status_changed";
	}
	if (type === "issue_mentioned" || type === "story_mentioned")
		return "mentioned";
	if (type === "comment" || type === "document_comment") return "comment";
	if (
		type === "project_update" ||
		type === "document_update" ||
		type === "whiteboard_update" ||
		type === "client_update"
	) {
		return "update";
	}
	if (
		type === "issue_due_soon" ||
		type === "issue_overdue" ||
		type === "issue_stale"
	) {
		return "reminder";
	}
	return "system";
}

function deriveEntity(args: CreateNotificationArgs): {
	entityType:
		| "issue"
		| "task"
		| "story"
		| "project"
		| "document"
		| "whiteboard"
		| "client"
		| "comment";
	entityId: string;
} | null {
	if (args.issueId) return { entityType: "issue", entityId: args.issueId };
	if (args.taskId) return { entityType: "task", entityId: args.taskId };
	if (args.storyId) return { entityType: "story", entityId: args.storyId };
	if (args.projectId)
		return { entityType: "project", entityId: args.projectId };
	if (args.documentId)
		return { entityType: "document", entityId: args.documentId };
	if (args.whiteboardId)
		return { entityType: "whiteboard", entityId: args.whiteboardId };
	if (args.clientId) return { entityType: "client", entityId: args.clientId };
	if (args.commentId)
		return { entityType: "comment", entityId: args.commentId };
	return null;
}

/**
 * Internal helper for creating notifications from within mutations.
 * Wrapped in try/catch so notification failures never break parent mutations.
 * The actor (actorId) is never sent a self-notification.
 */
export async function createNotification(
	ctx: MutationCtx,
	args: CreateNotificationArgs,
): Promise<boolean> {
	try {
		// Never notify the actor themselves
		if (args.actorId && args.userId === args.actorId) {
			return false;
		}

		// Respect user-level in-app notification toggle when explicitly disabled.
		const recipient = await ctx.db.get(args.userId);
		if (!recipient || recipient.notifyInApp === false) {
			return false;
		}

		// De-dupe idempotent notifications (e.g. reminders)
		if (args.dedupeKey) {
			const existing = await ctx.db
				.query("notifications")
				.withIndex("by_user_workspace_dedupe", (q) =>
					q
						.eq("userId", args.userId)
						.eq("workspaceId", args.workspaceId)
						.eq("dedupeKey", args.dedupeKey),
				)
				.unique();
			if (existing && !existing.deletedAt) {
				return false;
			}
		}

		const derivedEntity = deriveEntity(args);
		const entityType = args.entityType ?? derivedEntity?.entityType;
		const entityId = args.entityId ?? derivedEntity?.entityId;

		await ctx.db.insert("notifications", {
			userId: args.userId,
			workspaceId: args.workspaceId,
			type: args.type,
			eventType: args.eventType ?? args.type,
			title: args.title,
			body: args.body,
			preview: args.preview,
			issueId: args.issueId,
			storyId: args.storyId,
			taskId: args.taskId,
			projectId: args.projectId,
			clientId: args.clientId,
			commentId: args.commentId,
			documentId: args.documentId,
			whiteboardId: args.whiteboardId,
			actorId: args.actorId,
			entityType,
			entityId,
			reason: args.reason ?? deriveReason(args.type),
			eventAt: args.eventAt ?? Date.now(),
			source: args.source ?? "mutation",
			dedupeKey: args.dedupeKey,
			isRead: false,
		});
		return true;
	} catch (_error) {
		// Notification creation must never break parent mutations
		console.error("Failed to create notification:", _error);
		return false;
	}
}

/**
 * Send notifications to multiple users. Skips the actor automatically.
 */
export async function notifyUsers(
	ctx: MutationCtx,
	userIds: Id<"users">[],
	args: Omit<CreateNotificationArgs, "userId">,
): Promise<void> {
	const uniqueIds = [...new Set(userIds)];
	for (const userId of uniqueIds) {
		await createNotification(ctx, { ...args, userId });
	}
}

/**
 * Notify all subscribers of an issue. Queries issueSubscriptions by the
 * by_issue index and sends notifications to each subscriber via notifyUsers.
 * Optionally exclude specific user IDs (e.g. users already notified directly).
 */
export async function notifySubscribers(
	ctx: MutationCtx,
	issueId: Id<"issues">,
	args: Omit<CreateNotificationArgs, "userId">,
	excludeUserIds?: Id<"users">[],
): Promise<void> {
	const subscriptions = await ctx.db
		.query("issueSubscriptions")
		.withIndex("by_issue", (q) => q.eq("issueId", issueId))
		.collect();

	const excludeSet = new Set(excludeUserIds ?? []);
	const subscriberIds = subscriptions
		.map((sub) => sub.userId)
		.filter((id) => !excludeSet.has(id));

	await notifyUsers(ctx, subscriberIds, args);
}
