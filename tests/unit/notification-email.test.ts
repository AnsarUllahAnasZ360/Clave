import { describe, expect, it } from "vitest";
import {
	buildNotificationEmail,
	EMAIL_RELAY_EVENT_TYPES,
	isEmailRelayEventType,
} from "../../src/lib/email/notification-email";

describe("isEmailRelayEventType", () => {
	it("accepts every value in EMAIL_RELAY_EVENT_TYPES", () => {
		for (const t of EMAIL_RELAY_EVENT_TYPES) {
			expect(isEmailRelayEventType(t)).toBe(true);
		}
	});

	it("rejects event types we deliberately do NOT email on", () => {
		// These are in-app only -- we don't want to page users for every system
		// log or AI job update.
		expect(isEmailRelayEventType("system")).toBe(false);
		expect(isEmailRelayEventType("ai_job_completed")).toBe(false);
		expect(isEmailRelayEventType("")).toBe(false);
		expect(isEmailRelayEventType("client_update")).toBe(false);
	});
});

describe("buildNotificationEmail", () => {
	const base = {
		recipientName: "Ansar Ullah",
		workspaceName: "Acme",
		eventType: "issue_assigned",
		title: "Assigned: CLV-42 Fix widget crash",
		body: "Please take a look when you get a chance",
		deepLinkUrl: "https://app.clave.com/acme/issues/CLV-42",
		settingsUrl: "https://app.clave.com/acme/inbox",
	};

	it("prefixes subject with workspace name", () => {
		const { subject } = buildNotificationEmail(base);
		expect(subject).toBe(`[Acme] ${base.title}`);
	});

	it("does not double-prefix when the title already contains the workspace name", () => {
		const { subject } = buildNotificationEmail({
			...base,
			title: "Acme weekly status report",
		});
		expect(subject).toBe("Acme weekly status report");
	});

	it("renders body + actor + link + footer for an issue-assigned notification", () => {
		const { html } = buildNotificationEmail({
			...base,
			actorName: "Sarah",
			issueIdentifier: "CLV-42",
			issueTitle: "Fix widget crash",
		});
		expect(html).toContain("Assigned to you");
		expect(html).toContain("Acme");
		expect(html).toContain("Fix widget crash");
		expect(html).toContain("Sarah");
		expect(html).toContain('href="https://app.clave.com/acme/issues/CLV-42"');
		expect(html).toContain('href="https://app.clave.com/acme/inbox"');
		expect(html).toContain("Hi Ansar,");
	});

	it("escapes HTML in user-controlled fields so a malicious title cannot break out of the body", () => {
		// Subject is delivered as a plain-text header; email clients don't
		// render tags there, so we don't escape — only the HTML body matters.
		const { html } = buildNotificationEmail({
			...base,
			title: 'Evil <script>alert("x")</script>',
			body: 'also <img src="x" onerror="alert(1)"> bad',
			actorName: "Mal <b>lory</b>",
		});
		expect(html).not.toContain("<script>");
		expect(html).not.toContain('onerror="alert');
		expect(html).toContain("&lt;script&gt;");
		expect(html).toContain("&lt;b&gt;lory&lt;/b&gt;");
	});

	it("falls back gracefully when body is missing (uses preview) and handles no actor", () => {
		const { html } = buildNotificationEmail({
			...base,
			body: undefined,
			preview: "A short preview of the comment",
			actorName: undefined,
		});
		expect(html).toContain("A short preview of the comment");
	});

	it("omits the greeting name when recipientName is missing", () => {
		const { html } = buildNotificationEmail({
			...base,
			recipientName: undefined,
		});
		expect(html).not.toContain("Hi ,");
		expect(html).toContain("You're getting this because");
	});

	it("uses project context when no issue is attached", () => {
		const { html } = buildNotificationEmail({
			...base,
			eventType: "project_update",
			title: "Project update posted",
			issueIdentifier: undefined,
			issueTitle: undefined,
			projectName: "Core API",
		});
		expect(html).toContain("Project update");
		expect(html).toContain("Core API");
	});

	it("labels every supported event type sensibly (no 'Notification' fallback)", () => {
		for (const t of EMAIL_RELAY_EVENT_TYPES) {
			const { html } = buildNotificationEmail({ ...base, eventType: t });
			// "Notification" is the generic fallback label — none of the
			// supported types should fall through to it.
			expect(html.toLowerCase()).not.toContain(">notification &middot;");
		}
	});
});
