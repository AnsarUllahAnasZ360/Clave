import { describe, expect, it } from "vitest";
import {
	buildFallbackIssueDraftFromTranscript,
	formatConversationTranscript,
	isExplicitCreateConfirmation,
	normalizeIssueTriageMetadata,
	rankDuplicateCandidates,
} from "../../../src/lib/chat/google-chat/conversation-triage";
import { parseGoogleChatTriageActionEvent } from "../../../src/lib/chat/google-chat/interaction-contract";

describe("google chat conversation triage utilities", () => {
	it("formats transcript and keeps most recent content when truncated", () => {
		const transcript = formatConversationTranscript(
			[
				{
					role: "user",
					text: "first message with setup details",
				},
				{
					role: "assistant",
					text: "assistant context and follow-up",
				},
				{
					role: "user",
					text: "latest critical reproduction details for retry failure",
				},
			],
			80,
		);

		expect(transcript).toContain("retry failure");
		expect(transcript).toContain("Earlier transcript omitted");
	});

	it("builds fallback issue draft from transcript", () => {
		const draft = buildFallbackIssueDraftFromTranscript([
			{
				role: "user",
				text: "@Clave create issue for flaky Google Chat retries",
			},
		]);
		expect(draft.title.toLowerCase()).toContain("flaky google chat retries");
		expect(draft.description).toContain("Conversation highlights");
	});

	it("normalizes triage metadata to supported enums", () => {
		const normalized = normalizeIssueTriageMetadata({
			priority: "HIGH",
			type: "task",
			labels: [" ChatOps ", "chatops", "infra", "backend", "extra"],
			reasoning: "Needs urgent stabilization for support workflows",
		});

		expect(normalized.priority).toBe("high");
		expect(normalized.type).toBe("issue");
		expect(normalized.labels).toEqual(["ChatOps", "infra", "backend", "extra"]);
		expect(normalized.reasoning).toContain("urgent stabilization");
	});

	it("ranks duplicate candidates using AI similarity hints when available", () => {
		const ranked = rankDuplicateCandidates({
			searchTerm: "google chat webhook retry duplicates",
			candidates: [
				{
					identifier: "GC-101",
					title: "Retry pipeline fails for Google Chat",
					status: "todo",
					priority: "high",
				},
				{
					identifier: "GC-102",
					title: "Fix billing webhook timeout",
					status: "backlog",
					priority: "medium",
				},
			],
			aiHints: [
				{
					identifier: "gc-102",
					similarity: 0.91,
					reason: "Same retry and delivery semantics",
				},
			],
			limit: 2,
		});

		expect(ranked[0]?.identifier).toBe("GC-102");
		expect((ranked[0]?.similarity ?? 0) > (ranked[1]?.similarity ?? 0)).toBe(
			true,
		);
	});

	it("parses confirm-create triage action with form inputs and confirmation flag", () => {
		const payload: Record<string, unknown> = {
			type: "CARD_CLICKED",
			message: {
				sender: { type: "HUMAN" },
			},
			common: {
				formInputs: {
					triage_issue_title: {
						stringInputs: { value: ["Retry webhook failures in Google Chat"] },
					},
					triage_issue_description: {
						stringInputs: {
							value: ["Investigate retries and idempotency path"],
						},
					},
				},
			},
			action: {
				actionMethodName: "confirm_triage_issue_create",
				parameters: [
					{ key: "conversation_key", value: "spaces/SPACE_1::thread-1" },
					{ key: "triage_priority", value: "high" },
					{ key: "triage_type", value: "bug" },
					{ key: "triage_labels", value: "backend,reliability" },
					{ key: "confirm_create", value: "true" },
				],
			},
		};

		const parsed = parseGoogleChatTriageActionEvent({
			payload,
			eventType: "CARD_CLICKED",
			eventId: "evt-triage-confirm",
		});
		expect(parsed).not.toBeNull();
		if (!parsed) throw new Error("Expected triage action payload");

		expect(parsed.actionId).toBe("confirm_triage_issue_create");
		expect(parsed.draftTitle).toBe("Retry webhook failures in Google Chat");
		expect(parsed.confirmCreate).toBe(true);
		expect(parsed.triageLabels).toEqual(["backend", "reliability"]);
		expect(isExplicitCreateConfirmation(parsed.parameters.confirm_create)).toBe(
			true,
		);
	});
});
