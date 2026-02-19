import type { Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";

type LogActivityArgs = {
	workspaceId: Id<"workspaces">;
	entityType:
		| "project"
		| "issue"
		| "task"
		| "story"
		| "client"
		| "comment"
		| "document"
		| "whiteboard";
	entityId: string;
	action: string;
	actorId: Id<"users">;
	description: string;
	issueId?: Id<"issues">;
	projectId?: Id<"projects">;
	taskId?: Id<"tasks">; // DEPRECATED -- use issueId
	storyId?: Id<"stories">; // DEPRECATED -- use issueId
	clientId?: Id<"clients">;
	documentId?: Id<"documents">;
	whiteboardId?: Id<"whiteboards">;
	field?: string;
	oldValue?: string;
	newValue?: string;
	metadata?: string;
};

/**
 * Log an activity entry. Wrapped in try/catch so failures never break parent mutations.
 */
export async function logActivity(
	ctx: MutationCtx,
	args: LogActivityArgs,
): Promise<void> {
	try {
		await ctx.db.insert("activityLogs", {
			workspaceId: args.workspaceId,
			entityType: args.entityType,
			entityId: args.entityId,
			action: args.action,
			actorId: args.actorId,
			description: args.description,
			issueId: args.issueId,
			projectId: args.projectId,
			taskId: args.taskId,
			storyId: args.storyId,
			clientId: args.clientId,
			documentId: args.documentId,
			whiteboardId: args.whiteboardId,
			field: args.field,
			oldValue: args.oldValue,
			newValue: args.newValue,
			metadata: args.metadata,
		});
	} catch {
		// Activity logging failures should never break parent mutations
	}
}
