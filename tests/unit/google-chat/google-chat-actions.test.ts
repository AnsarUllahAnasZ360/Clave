import { describe, expect, it } from "vitest";
import { buildGoogleChatIssueActionCard } from "../../../src/lib/chat/google-chat/action-card-builders";
import { parseGoogleChatActionEvent } from "../../../src/lib/chat/google-chat/interaction-contract";

describe("google chat action contract", () => {
	it("parses assign_to_me card action payload", () => {
		const payload: Record<string, unknown> = {
			type: "CARD_CLICKED",
			message: {
				sender: { type: "HUMAN" },
			},
			action: {
				actionMethodName: "assign_to_me",
				parameters: [
					{ key: "issue_id", value: "jx7abc123def456ghi789jklm" },
					{ key: "action_instance_id", value: "assign-button-v1" },
				],
			},
		};

		const parsed = parseGoogleChatActionEvent({
			payload,
			eventType: "CARD_CLICKED",
			eventId: "evt-123",
		});
		expect(parsed).not.toBeNull();
		if (!parsed) throw new Error("Expected parsed payload");

		expect(parsed.actionId).toBe("assign_to_me");
		expect(parsed.issueId).toBe("jx7abc123def456ghi789jklm");
		expect(parsed.requestedStatus).toBeNull();
		expect(parsed.actionResponseType).toBe("UPDATE_USER_MESSAGE_CARDS");
		expect(parsed.idempotencyKey).toContain("evt-123");
		expect(parsed.idempotencyKey).toContain("assign-button-v1");
	});

	it("parses non-destructive status action payload", () => {
		const payload: Record<string, unknown> = {
			type: "CARD_CLICKED",
			message: {
				sender: { type: "BOT" },
			},
			action: {
				actionMethodName: "set_status_non_destructive",
				parameters: [
					{ key: "issue_identifier", value: "gc-42" },
					{ key: "status", value: "in_progress" },
				],
			},
		};

		const parsed = parseGoogleChatActionEvent({
			payload,
			eventType: "CARD_CLICKED",
			eventId: "evt-456",
		});
		expect(parsed).not.toBeNull();
		if (!parsed) throw new Error("Expected parsed payload");

		expect(parsed.actionId).toBe("set_status_non_destructive");
		expect(parsed.issueIdentifier).toBe("GC-42");
		expect(parsed.requestedStatus).toBe("in_progress");
		expect(parsed.actionResponseType).toBe("UPDATE_MESSAGE");
	});

	it("throws on unsupported action method", () => {
		const payload: Record<string, unknown> = {
			type: "CARD_CLICKED",
			action: {
				actionMethodName: "delete_issue",
				parameters: [{ key: "issue_id", value: "abc" }],
			},
		};

		expect(() =>
			parseGoogleChatActionEvent({
				payload,
				eventType: "CARD_CLICKED",
				eventId: "evt-unsupported",
			}),
		).toThrow(/Unsupported Google Chat action/i);
	});

	it("returns null for non card-click events", () => {
		const payload: Record<string, unknown> = {
			type: "MESSAGE",
		};
		const parsed = parseGoogleChatActionEvent({
			payload,
			eventType: "MESSAGE",
			eventId: "evt-message",
		});
		expect(parsed).toBeNull();
	});

	it("builds success action response cards", () => {
		const responseType = "UPDATE_USER_MESSAGE_CARDS" as const;
		const card = buildGoogleChatIssueActionCard({
			responseType,
			resultType: "success",
			title: "Issue assigned",
			message: "Issue assigned to you.",
			issueIdentifier: "GC-12",
			issueTitle: "Route card clicks",
			issueStatus: "in_progress",
			assigneeName: "Jane Doe",
			deepLinkUrl: "https://clave.z360.js/acme/dev/issues/GC-12",
		});

		expect(card.actionResponse.type).toBe("UPDATE_USER_MESSAGE_CARDS");
		expect(card.cardsV2).toHaveLength(1);
		expect(card.cardsV2[0]?.card.header.title).toBe("Issue assigned");
	});
});
