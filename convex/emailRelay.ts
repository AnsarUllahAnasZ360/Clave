import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
// biome-ignore lint/suspicious/noTsIgnore: resolved by Convex bundler at deploy time
// @ts-ignore — resolved by Convex bundler at deploy time
import {
	buildNotificationEmail,
	EMAIL_RELAY_EVENT_TYPES,
	isEmailRelayEventType,
} from "../src/lib/email/notification-email";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { internalAction, internalQuery } from "./_generated/server";
import { sendEmail } from "./email";

export { EMAIL_RELAY_EVENT_TYPES };

const sendNotificationEmailRef = makeFunctionReference<
	"action",
	{
		notificationId: Id<"notifications">;
		workspaceId: Id<"workspaces">;
	},
	{ status: "sent" | "skipped" | "failed"; reason?: string }
>("emailRelay:sendNotificationEmail");

const prepareNotificationEmailRef = makeFunctionReference<
	"query",
	{
		notificationId: Id<"notifications">;
		workspaceId: Id<"workspaces">;
	},
	{
		status: "ready" | "drop";
		reason?: string;
		to?: string;
		subject?: string;
		html?: string;
	}
>("emailRelay:prepareNotificationEmail");

function normalizeAppBaseUrl(rawValue: string | undefined): string {
	const value = rawValue?.trim();
	if (!value) return "https://clave.z360.biz";
	const withProtocol =
		value.startsWith("http://") || value.startsWith("https://")
			? value
			: `https://${value}`;
	try {
		const parsed = new URL(withProtocol);
		return `${parsed.origin}${parsed.pathname.replace(/\/$/, "")}`;
	} catch {
		return "https://clave.z360.biz";
	}
}

/**
 * Enqueue an email send for a notification, mirroring the Google Chat relay.
 * Callable from any mutation (e.g. createNotification). Gates:
 *   - event type must be in EMAIL_RELAY_EVENT_TYPES
 *   - recipient must exist, have an email, and not have notifyEmail === false
 *
 * Does not block caller on failure; the actual send runs in a scheduled action.
 */
export async function enqueueEmailForNotification(
	ctx: MutationCtx,
	args: {
		notificationId: Id<"notifications">;
		workspaceId: Id<"workspaces">;
		userId: Id<"users">;
		eventType: string;
	},
): Promise<{ queued: number; skipped: number }> {
	if (!isEmailRelayEventType(args.eventType)) {
		return { queued: 0, skipped: 1 };
	}

	const recipient = await ctx.db.get(args.userId);
	if (!recipient) return { queued: 0, skipped: 1 };
	if (recipient.notifyEmail === false) return { queued: 0, skipped: 1 };
	if (!recipient.email) return { queued: 0, skipped: 1 };

	await ctx.scheduler.runAfter(0, sendNotificationEmailRef, {
		notificationId: args.notificationId,
		workspaceId: args.workspaceId,
	});
	return { queued: 1, skipped: 0 };
}

export const prepareNotificationEmail = internalQuery({
	args: {
		notificationId: v.id("notifications"),
		workspaceId: v.id("workspaces"),
	},
	returns: v.object({
		status: v.union(v.literal("ready"), v.literal("drop")),
		reason: v.optional(v.string()),
		to: v.optional(v.string()),
		subject: v.optional(v.string()),
		html: v.optional(v.string()),
	}),
	handler: async (ctx, args) => {
		const notification = await ctx.db.get(args.notificationId);
		if (!notification) {
			return { status: "drop" as const, reason: "Notification not found" };
		}

		const eventType = notification.eventType ?? notification.type;
		if (!isEmailRelayEventType(eventType)) {
			return {
				status: "drop" as const,
				reason: `Event type ${eventType} is not emailable`,
			};
		}

		const [recipient, workspace, actor, issue, project] = await Promise.all([
			ctx.db.get(notification.userId),
			ctx.db.get(args.workspaceId),
			notification.actorId ? ctx.db.get(notification.actorId) : null,
			notification.issueId ? ctx.db.get(notification.issueId) : null,
			notification.projectId ? ctx.db.get(notification.projectId) : null,
		]);

		if (!recipient) {
			return { status: "drop" as const, reason: "Recipient not found" };
		}
		if (!recipient.email) {
			return { status: "drop" as const, reason: "Recipient has no email" };
		}
		if (recipient.notifyEmail === false) {
			return {
				status: "drop" as const,
				reason: "Recipient opted out of email",
			};
		}
		if (!workspace) {
			return { status: "drop" as const, reason: "Workspace not found" };
		}

		const baseUrl = normalizeAppBaseUrl(
			process.env.APP_URL ?? process.env.NEXT_PUBLIC_APP_URL,
		);
		const workspaceBase = `${baseUrl}/${workspace.slug}`;
		const settingsUrl = `${workspaceBase}/inbox`;
		const deepLinkUrl = (() => {
			if (issue) {
				const seg = issue.identifier ?? notification.issueId;
				return `${workspaceBase}/issues/${seg}`;
			}
			if (project) {
				const seg = project.slug ?? project._id;
				return `${workspaceBase}/projects/${seg}`;
			}
			if (notification.documentId) {
				return `${workspaceBase}/docs/${notification.documentId}`;
			}
			if (notification.whiteboardId) {
				return `${workspaceBase}/boards/${notification.whiteboardId}`;
			}
			if (notification.clientId) {
				return `${workspaceBase}/clients/${notification.clientId}`;
			}
			return `${workspaceBase}/inbox`;
		})();

		const { subject, html } = buildNotificationEmail({
			recipientName: recipient.name,
			workspaceName: workspace.name,
			eventType,
			title: notification.title,
			body: notification.body,
			preview: notification.preview,
			actorName: actor?.name,
			issueIdentifier: issue?.identifier,
			issueTitle: issue?.title,
			projectName: project?.name,
			deepLinkUrl,
			settingsUrl,
		});

		return {
			status: "ready" as const,
			to: recipient.email,
			subject,
			html,
		};
	},
});

export const sendNotificationEmail = internalAction({
	args: {
		notificationId: v.id("notifications"),
		workspaceId: v.id("workspaces"),
	},
	returns: v.object({
		status: v.union(
			v.literal("sent"),
			v.literal("skipped"),
			v.literal("failed"),
		),
		reason: v.optional(v.string()),
	}),
	handler: async (
		ctx,
		args,
	): Promise<{
		status: "sent" | "skipped" | "failed";
		reason?: string;
	}> => {
		const prepared = await ctx.runQuery(prepareNotificationEmailRef, {
			notificationId: args.notificationId,
			workspaceId: args.workspaceId,
		});

		if (prepared.status === "drop") {
			return {
				status: "skipped" as const,
				reason: prepared.reason ?? "Email preparation dropped",
			};
		}

		if (!prepared.to || !prepared.subject || !prepared.html) {
			return {
				status: "skipped" as const,
				reason: "Prepared email payload incomplete",
			};
		}

		try {
			await sendEmail({
				to: prepared.to,
				subject: prepared.subject,
				body: prepared.html,
			});
			return { status: "sent" as const };
		} catch (error) {
			const reason =
				error instanceof Error ? error.message : "Unknown send error";
			console.error("[email-relay] send failed", {
				notificationId: args.notificationId,
				workspaceId: args.workspaceId,
				reason,
			});
			return { status: "failed" as const, reason };
		}
	},
});
