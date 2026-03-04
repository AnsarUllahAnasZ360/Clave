import { v } from "convex/values";
import { buildGoogleChatCardMessage } from "../../src/lib/chat/google-chat/card-builders";
import { internalQuery } from "../_generated/server";

function normalizeAppBaseUrl(rawValue: string | undefined): string {
	const value = rawValue?.trim();
	if (!value) return "";
	const withProtocol =
		value.startsWith("http://") || value.startsWith("https://")
			? value
			: `https://${value}`;
	try {
		const parsed = new URL(withProtocol);
		return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
	} catch {
		return "";
	}
}

function buildWorkspaceBasePath(args: { workspaceSlug: string }) {
	return `/${args.workspaceSlug}`;
}

function joinUrl(baseUrl: string, path: string) {
	if (!baseUrl) return path;
	if (path.startsWith("/")) return `${baseUrl}${path}`;
	return `${baseUrl}/${path}`;
}

/**
 * Prepare a notification card for relay delivery.
 * Takes notification ID + workspace ID directly (no delivery log intermediary).
 */
export const prepareNotificationCard = internalQuery({
	args: {
		notificationId: v.id("notifications"),
		workspaceId: v.id("workspaces"),
	},
	returns: v.object({
		status: v.union(v.literal("ready"), v.literal("drop")),
		reason: v.optional(v.string()),
		messageJson: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const notification = await ctx.db.get(args.notificationId);
		if (!notification) {
			return { status: "drop" as const, reason: "Notification not found" };
		}

		const policy = await ctx.db
			.query("chatPolicies")
			.withIndex("by_workspace_provider", (q) =>
				q.eq("workspaceId", args.workspaceId).eq("provider", "google-chat"),
			)
			.first();
		if (policy && !policy.enabled) {
			return {
				status: "drop" as const,
				reason: "Google Chat delivery disabled by workspace policy",
			};
		}

		const workspace = await ctx.db.get(args.workspaceId);
		if (!workspace) {
			return { status: "drop" as const, reason: "Workspace not found" };
		}

		const [actor, issue, project] = await Promise.all([
			notification.actorId ? ctx.db.get(notification.actorId) : null,
			notification.issueId ? ctx.db.get(notification.issueId) : null,
			notification.projectId ? ctx.db.get(notification.projectId) : null,
		]);

		const workspaceBasePath = buildWorkspaceBasePath({
			workspaceSlug: workspace.slug,
		});

		const notificationPath = (() => {
			if (issue) {
				const issueSegment = issue.identifier ?? notification.issueId;
				return `${workspaceBasePath}/issues/${issueSegment}`;
			}
			if (project) {
				const projectSegment = project.slug ?? project._id;
				return `${workspaceBasePath}/projects/${projectSegment}`;
			}
			if (notification.documentId) {
				return `${workspaceBasePath}/docs/${notification.documentId}`;
			}
			if (notification.whiteboardId) {
				return `${workspaceBasePath}/boards/${notification.whiteboardId}`;
			}
			if (notification.clientId) {
				return `${workspaceBasePath}/clients/${notification.clientId}`;
			}
			return `${workspaceBasePath}/inbox`;
		})();

		const appBaseUrl = normalizeAppBaseUrl(
			process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL,
		);
		const deepLinkUrl = joinUrl(appBaseUrl, notificationPath);
		const eventType = notification.eventType ?? notification.type;
		const cardMessage = buildGoogleChatCardMessage({
			eventType,
			title: notification.title,
			body: notification.body,
			preview: notification.preview,
			deepLinkUrl,
			actorName: actor?.name,
			issueIdentifier: issue?.identifier,
			issueTitle: issue?.title,
			projectName: project?.name,
		});

		return {
			status: "ready" as const,
			messageJson: JSON.stringify(cardMessage),
		};
	},
});
