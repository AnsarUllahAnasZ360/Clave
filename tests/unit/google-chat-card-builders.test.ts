import { describe, expect, it } from "vitest";
import { buildGoogleChatCardMessage } from "../../src/lib/chat/google-chat/card-builders";

describe("google chat card builders", () => {
	it("builds issue notification cards with deep links", () => {
		const message = buildGoogleChatCardMessage({
			eventType: "issue_assigned",
			title: "Issue assigned to you",
			body: "CLV-42: Fix Google Chat relay retries",
			deepLinkUrl: "https://clave.z360.js/acme/dev/issues/CLV-42",
			actorName: "Ansar",
			issueIdentifier: "CLV-42",
			issueTitle: "Fix Google Chat relay retries",
			projectName: "Google Chat",
		});

		expect(message.cardsV2).toHaveLength(1);
		expect(message.cardsV2[0]?.card.header.title).toBe("Issue assigned to you");
		expect(message.cardsV2[0]?.card.sections.at(-1)?.widgets[0]).toEqual({
			buttonList: {
				buttons: [
					{
						text: "Open in Clave",
						onClick: {
							openLink: {
								url: "https://clave.z360.js/acme/dev/issues/CLV-42",
							},
						},
					},
				],
			},
		});
		expect(message.fallbackText).toContain("CLV-42");
	});

	it("builds comment relay payloads with context line", () => {
		const message = buildGoogleChatCardMessage({
			eventType: "comment",
			title: "New comment on your issue",
			preview: "Can we ship this in sprint 001?",
			deepLinkUrl: "https://clave.z360.js/acme/dev/issues/CLV-88",
			actorName: "Teammate",
			issueIdentifier: "CLV-88",
			issueTitle: "Google Chat integration",
		});

		expect(message.cardsV2[0]?.card.header.subtitle).toBe("Comment");
		expect(message.cardsV2[0]?.card.sections).toHaveLength(3);
		expect(message.fallbackText).toContain("Teammate");
		expect(message.text).toContain("Can we ship this in sprint 001?");
	});

	it("escapes HTML in user-provided body text", () => {
		const message = buildGoogleChatCardMessage({
			eventType: "project_update",
			title: "Project update",
			body: "<script>alert('xss')</script>",
			deepLinkUrl: "https://clave.z360.js/acme/dev/projects/google-chat",
		});

		const contentWidget = message.cardsV2[0]?.card.sections[0]?.widgets[0];
		expect(contentWidget).toEqual({
			textParagraph: {
				text: "&lt;script&gt;alert('xss')&lt;/script&gt;",
			},
		});
	});
});
