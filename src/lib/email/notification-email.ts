/**
 * Pure template builder for notification emails.
 *
 * Kept free of Convex / DOM dependencies so it can be unit-tested in isolation
 * and imported from both the Convex bundle (via emailRelay.ts) and any future
 * preview/admin tooling.
 */

export type NotificationEmailArgs = {
	recipientName?: string;
	workspaceName: string;
	eventType: string;
	title: string;
	body?: string;
	preview?: string;
	actorName?: string;
	issueIdentifier?: string;
	issueTitle?: string;
	projectName?: string;
	deepLinkUrl: string;
	settingsUrl?: string;
};

export type NotificationEmail = {
	subject: string;
	html: string;
};

export const EMAIL_RELAY_EVENT_TYPES = [
	"issue_assigned",
	"issue_status_changed",
	"issue_mentioned",
	"issue_due_soon",
	"issue_overdue",
	"issue_stale",
	"comment",
	"project_update",
	"document_comment",
	"document_update",
	"whiteboard_update",
] as const;

export type EmailRelayEventType = (typeof EMAIL_RELAY_EVENT_TYPES)[number];

export function isEmailRelayEventType(
	value: string,
): value is EmailRelayEventType {
	return (EMAIL_RELAY_EVENT_TYPES as readonly string[]).includes(value);
}

function escapeHtml(raw: string): string {
	return raw
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#39;");
}

function prefixSubject(workspaceName: string, title: string): string {
	const trimmedTitle = title.trim();
	const trimmedWs = workspaceName.trim();
	if (!trimmedWs) return trimmedTitle;
	if (trimmedTitle.toLowerCase().includes(trimmedWs.toLowerCase())) {
		return trimmedTitle;
	}
	return `[${trimmedWs}] ${trimmedTitle}`;
}

function eventTypeLabel(eventType: string): string {
	switch (eventType) {
		case "issue_assigned":
			return "Assigned to you";
		case "issue_status_changed":
			return "Status updated";
		case "issue_mentioned":
			return "You were mentioned";
		case "issue_due_soon":
			return "Due soon";
		case "issue_overdue":
			return "Overdue";
		case "issue_stale":
			return "Going stale";
		case "comment":
			return "New comment";
		case "project_update":
			return "Project update";
		case "document_comment":
			return "New document comment";
		case "document_update":
			return "Document updated";
		case "whiteboard_update":
			return "Whiteboard updated";
		default:
			return "Notification";
	}
}

function firstName(name: string | undefined): string | undefined {
	const trimmed = name?.trim();
	if (!trimmed) return undefined;
	return trimmed.split(/\s+/)[0];
}

export function buildNotificationEmail(
	args: NotificationEmailArgs,
): NotificationEmail {
	const subject = prefixSubject(args.workspaceName, args.title);
	const label = eventTypeLabel(args.eventType);
	const greeting = firstName(args.recipientName);
	const bodyText = (args.body?.trim() || args.preview?.trim() || "") as string;

	const contextLine = (() => {
		if (args.issueIdentifier && args.issueTitle) {
			return `${escapeHtml(args.issueIdentifier)} &middot; ${escapeHtml(args.issueTitle)}`;
		}
		if (args.projectName) {
			return `Project &middot; ${escapeHtml(args.projectName)}`;
		}
		return "";
	})();

	const actorLine = args.actorName
		? `<p style="margin: 0 0 12px; color: #666; font-size: 13px;">${escapeHtml(args.actorName)}</p>`
		: "";

	const footerTail = args.settingsUrl
		? ` <a href="${escapeHtml(args.settingsUrl)}" style="color: #888;">Manage notifications</a>.`
		: "";

	const html = [
		`<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 520px; margin: 0 auto; color: #0A0A0A; background: #FAFAFA; padding: 24px;">`,
		`<div style="background: #ffffff; border: 1px solid #e5e5e5; border-radius: 12px; padding: 28px;">`,
		`<p style="margin: 0 0 4px; color: #C26A3A; font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;">${escapeHtml(label)} &middot; ${escapeHtml(args.workspaceName)}</p>`,
		`<h2 style="margin: 0 0 12px; font-size: 18px; line-height: 1.4;">${escapeHtml(args.title)}</h2>`,
		contextLine
			? `<p style="margin: 0 0 16px; color: #555; font-size: 13px;">${contextLine}</p>`
			: "",
		actorLine,
		bodyText
			? `<p style="margin: 0 0 20px; color: #333; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">${escapeHtml(bodyText)}</p>`
			: "",
		`<a href="${escapeHtml(args.deepLinkUrl)}" style="display: inline-block; background: #C26A3A; color: #FAFAFA; padding: 10px 20px; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 14px;">Open in Clave</a>`,
		`</div>`,
		`<p style="margin: 16px 0 0; color: #888; font-size: 11px; text-align: center;">${greeting ? `Hi ${escapeHtml(greeting)}, you're` : "You're"} getting this because you're a member of ${escapeHtml(args.workspaceName)}.${footerTail}</p>`,
		`</div>`,
	]
		.filter((line) => line.length > 0)
		.join("\n");

	return { subject, html };
}
