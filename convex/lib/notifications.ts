import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type NotificationType =
	// Issue-centric types (preferred)
	| "issue_assigned"
	| "issue_status_changed"
	| "issue_mentioned"
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

interface CreateNotificationArgs {
	userId: Id<"users">;
	workspaceId: Id<"workspaces">;
	type: NotificationType;
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
}

/**
 * Internal helper for creating notifications from within mutations.
 * Wrapped in try/catch so notification failures never break parent mutations.
 * The actor (actorId) is never sent a self-notification.
 */
export async function createNotification(
	ctx: MutationCtx,
	args: CreateNotificationArgs,
): Promise<void> {
	try {
		// Never notify the actor themselves
		if (args.actorId && args.userId === args.actorId) {
			return;
		}

		await ctx.db.insert("notifications", {
			userId: args.userId,
			workspaceId: args.workspaceId,
			type: args.type,
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
			isRead: false,
		});
	} catch (_error) {
		// Notification creation must never break parent mutations
		console.error("Failed to create notification:", _error);
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
