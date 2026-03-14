import type { GoogleChatActionResponseType } from "./interaction-contract";

type GoogleChatActionParameter = {
	key: string;
	value: string;
};

type GoogleChatActionButton = {
	text: string;
	onClick: {
		action?: {
			actionMethodName: string;
			parameters: GoogleChatActionParameter[];
		};
		openLink?: {
			url: string;
		};
	};
};

type GoogleChatCardSection = {
	widgets: Array<
		| {
				textParagraph: {
					text: string;
				};
		  }
		| {
				textInput: {
					name: string;
					label: string;
					type: "SINGLE_LINE" | "MULTIPLE_LINE";
					value?: string;
				};
		  }
		| {
				buttonList: {
					buttons: GoogleChatActionButton[];
				};
		  }
	>;
};

type GoogleChatCard = {
	header: {
		title: string;
		subtitle?: string;
	};
	sections: GoogleChatCardSection[];
};

type GoogleChatCardWithId = {
	cardId: string;
	card: GoogleChatCard;
};

export type GoogleChatAssistantMessage = {
	text: string;
	fallbackText: string;
	cardsV2: GoogleChatCardWithId[];
};

export type GoogleChatAssistantActionResponse = GoogleChatAssistantMessage & {
	actionResponse: {
		type: GoogleChatActionResponseType;
	};
};

type GoogleChatIssueDuplicateHint = {
	identifier: string;
	title: string;
	similarity?: number;
	reason?: string;
};

function escapeCardText(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

/**
 * Strip markdown formatting to produce plain text for fallback fields.
 */
function stripMarkdown(md: string): string {
	let result = md;
	result = result.replace(/^#{1,6}\s+/gm, "");
	result = result.replace(/\*\*(.+?)\*\*/g, "$1");
	result = result.replace(/__(.+?)__/g, "$1");
	result = result.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, "$1");
	result = result.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, "$1");
	result = result.replace(/~~(.+?)~~/g, "$1");
	result = result.replace(/`([^`]+)`/g, "$1");
	result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
	result = result.replace(/^[\s]*[-*]\s+/gm, "• ");
	return result;
}

/**
 * Convert markdown to the HTML subset supported by Google Chat textParagraph.
 * Supported: <b>, <i>, <br>, <a href>, <strike>.
 * Strips unsupported markdown constructs (headings, emojis as bullets).
 */
function markdownToGoogleChatHtml(md: string): string {
	let result = md;

	// Remove heading markers (### Title → Title in bold)
	result = result.replace(/^#{1,6}\s+(.+)$/gm, "<b>$1</b>");

	// Bold: **text** or __text__
	result = result.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
	result = result.replace(/__(.+?)__/g, "<b>$1</b>");

	// Italic: *text* or _text_ (but not inside words)
	result = result.replace(/(?<!\w)\*([^*]+?)\*(?!\w)/g, "<i>$1</i>");
	result = result.replace(/(?<!\w)_([^_]+?)_(?!\w)/g, "<i>$1</i>");

	// Strikethrough: ~~text~~
	result = result.replace(/~~(.+?)~~/g, "<strike>$1</strike>");

	// Inline code: `text` → just use the text (no HTML equivalent)
	result = result.replace(/`([^`]+)`/g, "$1");

	// Links: [text](url)
	result = result.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');

	// Unordered list markers: - item or * item → • item
	result = result.replace(/^[\s]*[-*]\s+/gm, "• ");

	// Remove emoji-style bullet prefixes (e.g., "🔍 " at start of line)
	result = result.replace(
		/^•\s*[\p{Emoji_Presentation}\p{Extended_Pictographic}]\s*/gmu,
		"• ",
	);

	// Newlines to <br> for card rendering
	result = result.replace(/\n/g, "<br>");

	return result;
}

function buildApprovalActionParameters(input: {
	approvalId: string;
	toolCallId: string;
	threadId: string;
}) {
	return [
		{ key: "approval_id", value: input.approvalId },
		{ key: "tool_call_id", value: input.toolCallId },
		{ key: "thread_id", value: input.threadId },
	];
}

function clampActionParameterValue(value: string, maxLength: number) {
	const trimmed = value.trim();
	if (trimmed.length <= maxLength) return trimmed;
	return trimmed.slice(0, maxLength);
}

function buildConversationTriageActionParameters(input: {
	conversationKey: string;
	spaceName?: string;
	threadName?: string;
	latestPrompt?: string;
	assistantReply?: string;
}): GoogleChatActionParameter[] {
	const parameters: GoogleChatActionParameter[] = [
		{ key: "conversation_key", value: input.conversationKey },
	];
	if (input.spaceName) {
		parameters.push({
			key: "source_space_name",
			value: input.spaceName,
		});
	}
	if (input.threadName) {
		parameters.push({
			key: "source_thread_name",
			value: input.threadName,
		});
	}
	if (input.latestPrompt) {
		parameters.push({
			key: "latest_prompt",
			value: clampActionParameterValue(input.latestPrompt, 280),
		});
	}
	if (input.assistantReply) {
		parameters.push({
			key: "assistant_reply",
			value: clampActionParameterValue(input.assistantReply, 280),
		});
	}
	return parameters;
}

export function buildGoogleChatApprovalRequestCard(input: {
	assistantText: string;
	approvalId: string;
	toolCallId: string;
	threadId: string;
	approvalDescription: string;
	toolName: string;
}): GoogleChatAssistantMessage {
	const parameters = buildApprovalActionParameters(input);
	const messageText = input.assistantText.trim();
	const approvalText = input.approvalDescription.trim();

	return {
		text: messageText,
		fallbackText: `${messageText}\nApproval required: ${approvalText}`,
		cardsV2: [
			{
				cardId: `clave-approval-${input.approvalId}`,
				card: {
					header: {
						title: "Approval required",
						subtitle: input.toolName,
					},
					sections: [
						{
							widgets: [
								{
									textParagraph: {
										text: escapeCardText(messageText),
									},
								},
							],
						},
						{
							widgets: [
								{
									textParagraph: {
										text: `<b>Proposed action:</b> ${escapeCardText(approvalText)}`,
									},
								},
							],
						},
						{
							widgets: [
								{
									buttonList: {
										buttons: [
											{
												text: "Approve",
												onClick: {
													action: {
														actionMethodName: "ai_approval_approve",
														parameters,
													},
												},
											},
											{
												text: "Reject",
												onClick: {
													action: {
														actionMethodName: "ai_approval_reject",
														parameters,
													},
												},
											},
										],
									},
								},
							],
						},
					],
				},
			},
		],
	};
}

export function buildGoogleChatAssistantTextCard(input: {
	title: string;
	subtitle?: string;
	message: string;
	triageAction?: {
		conversationKey: string;
		spaceName?: string;
		threadName?: string;
		latestPrompt?: string;
		assistantReply?: string;
	};
}): GoogleChatAssistantMessage {
	const message = input.message.trim();
	const sections: GoogleChatCardSection[] = [
		{
			widgets: [
				{
					textParagraph: {
						text: markdownToGoogleChatHtml(escapeCardText(message)),
					},
				},
			],
		},
	];

	if (input.triageAction) {
		sections.push({
			widgets: [
				{
					buttonList: {
						buttons: [
							{
								text: "Create issue draft",
								onClick: {
									action: {
										actionMethodName: "triage_conversation_to_issue",
										parameters: buildConversationTriageActionParameters(
											input.triageAction,
										),
									},
								},
							},
						],
					},
				},
			],
		});
	}

	// Strip markdown for plain-text fields (text, fallbackText)
	const plainMessage = stripMarkdown(message);
	return {
		text: plainMessage,
		fallbackText: plainMessage,
		cardsV2: [
			{
				cardId: "clave-assistant-message",
				card: {
					header: {
						title: input.title,
						subtitle: input.subtitle,
					},
					sections,
				},
			},
		],
	};
}

function formatDuplicateLine(duplicate: GoogleChatIssueDuplicateHint): string {
	const similarity =
		typeof duplicate.similarity === "number"
			? ` (${Math.round(duplicate.similarity * 100)}% match)`
			: "";
	const reason = duplicate.reason ? ` — ${duplicate.reason}` : "";
	return `• ${escapeCardText(duplicate.identifier)}: ${escapeCardText(duplicate.title)}${similarity}${escapeCardText(reason)}`;
}

export function buildGoogleChatIssueTriageDraftCard(input: {
	responseType: GoogleChatActionResponseType;
	title: string;
	description: string;
	priority: string;
	issueType: string;
	labels: string[];
	reasoning?: string;
	conversationKey: string;
	sourceSpaceName?: string;
	sourceThreadName?: string;
	duplicates: GoogleChatIssueDuplicateHint[];
}): GoogleChatAssistantActionResponse {
	const safeTitle = input.title.trim();
	const safeDescription = input.description.trim();
	const metadata = [
		`<b>Priority:</b> ${escapeCardText(input.priority)}`,
		`<b>Type:</b> ${escapeCardText(input.issueType)}`,
		`<b>Labels:</b> ${escapeCardText(input.labels.join(", ") || "none")}`,
	].join(" · ");

	const confirmParameters: GoogleChatActionParameter[] = [
		{ key: "confirm_create", value: "true" },
		{ key: "conversation_key", value: input.conversationKey },
		{ key: "triage_priority", value: input.priority },
		{ key: "triage_type", value: input.issueType },
		{ key: "triage_labels", value: input.labels.join(",") },
		{
			key: "draft_title",
			value: clampActionParameterValue(safeTitle, 140),
		},
		{
			key: "draft_description",
			value: clampActionParameterValue(safeDescription, 1200),
		},
	];
	if (input.sourceSpaceName) {
		confirmParameters.push({
			key: "source_space_name",
			value: input.sourceSpaceName,
		});
	}
	if (input.sourceThreadName) {
		confirmParameters.push({
			key: "source_thread_name",
			value: input.sourceThreadName,
		});
	}

	const cancelParameters: GoogleChatActionParameter[] = [
		{ key: "conversation_key", value: input.conversationKey },
	];

	const sections: GoogleChatCardSection[] = [
		{
			widgets: [
				{
					textParagraph: {
						text: "Review and confirm to create a Clave issue from this conversation.",
					},
				},
			],
		},
		{
			widgets: [
				{
					textInput: {
						name: "triage_issue_title",
						label: "Issue title",
						type: "SINGLE_LINE",
						value: safeTitle,
					},
				},
			],
		},
		{
			widgets: [
				{
					textInput: {
						name: "triage_issue_description",
						label: "Issue description",
						type: "MULTIPLE_LINE",
						value: safeDescription,
					},
				},
			],
		},
		{
			widgets: [
				{
					textParagraph: {
						text: metadata,
					},
				},
			],
		},
	];

	if (input.reasoning) {
		sections.push({
			widgets: [
				{
					textParagraph: {
						text: `<b>Triage reasoning:</b> ${escapeCardText(input.reasoning)}`,
					},
				},
			],
		});
	}

	if (input.duplicates.length > 0) {
		sections.push({
			widgets: [
				{
					textParagraph: {
						text: `<b>Possible duplicates (informational)</b>\n${input.duplicates
							.map((duplicate) => formatDuplicateLine(duplicate))
							.join("\n")}`,
					},
				},
			],
		});
	}

	sections.push({
		widgets: [
			{
				buttonList: {
					buttons: [
						{
							text: "Confirm create",
							onClick: {
								action: {
									actionMethodName: "confirm_triage_issue_create",
									parameters: confirmParameters,
								},
							},
						},
						{
							text: "Cancel",
							onClick: {
								action: {
									actionMethodName: "cancel_triage_issue_create",
									parameters: cancelParameters,
								},
							},
						},
					],
				},
			},
		],
	});

	return {
		actionResponse: {
			type: input.responseType,
		},
		text: `Draft ready: ${safeTitle}`,
		fallbackText: `Draft ready: ${safeTitle}`,
		cardsV2: [
			{
				cardId: "clave-triage-issue-draft",
				card: {
					header: {
						title: "Draft issue from conversation",
						subtitle: "Review before create",
					},
					sections,
				},
			},
		],
	};
}

export function buildGoogleChatIssueTriageResultCard(input: {
	responseType: GoogleChatActionResponseType;
	title: string;
	message: string;
	status: "success" | "failure" | "cancelled" | "permission_denied";
	issueIdentifier?: string;
	issueTitle?: string;
	deepLinkUrl?: string;
}): GoogleChatAssistantActionResponse {
	const subtitle =
		input.status === "success"
			? "Issue created"
			: input.status === "cancelled"
				? "Cancelled"
				: input.status === "permission_denied"
					? "Permission denied"
					: "Action failed";

	const sections: GoogleChatCardSection[] = [
		{
			widgets: [
				{
					textParagraph: {
						text: escapeCardText(input.message),
					},
				},
			],
		},
	];

	if (input.issueIdentifier || input.issueTitle) {
		sections.push({
			widgets: [
				{
					textParagraph: {
						text: `<b>Issue:</b> ${escapeCardText(
							[input.issueIdentifier, input.issueTitle]
								.filter(Boolean)
								.join(" · "),
						)}`,
					},
				},
			],
		});
	}

	if (input.deepLinkUrl) {
		sections.push({
			widgets: [
				{
					buttonList: {
						buttons: [
							{
								text: "Open in Clave",
								onClick: {
									openLink: {
										url: input.deepLinkUrl,
									},
								},
							},
						],
					},
				},
			],
		});
	}

	return {
		actionResponse: {
			type: input.responseType,
		},
		text: `${input.title}: ${input.message}`,
		fallbackText: `${input.title}: ${input.message}`,
		cardsV2: [
			{
				cardId: "clave-triage-issue-result",
				card: {
					header: {
						title: input.title,
						subtitle,
					},
					sections,
				},
			},
		],
	};
}

export function buildGoogleChatApprovalActionCard(input: {
	responseType: GoogleChatActionResponseType;
	title: string;
	message: string;
	status: "success" | "failure" | "permission_denied" | "duplicate";
	toolName?: string;
	approvalDescription?: string;
}): GoogleChatAssistantActionResponse {
	const subtitle =
		input.status === "success"
			? "Action completed"
			: input.status === "permission_denied"
				? "Permission denied"
				: input.status === "duplicate"
					? "Already processed"
					: "Action failed";

	const sections: GoogleChatCardSection[] = [
		{
			widgets: [
				{
					textParagraph: {
						text: escapeCardText(input.message),
					},
				},
			],
		},
	];

	if (input.approvalDescription) {
		sections.push({
			widgets: [
				{
					textParagraph: {
						text: `<b>Action:</b> ${escapeCardText(input.approvalDescription)}`,
					},
				},
			],
		});
	}

	return {
		actionResponse: {
			type: input.responseType,
		},
		text: `${input.title}: ${input.message}`,
		fallbackText: `${input.title}: ${input.message}`,
		cardsV2: [
			{
				cardId: "clave-approval-action-result",
				card: {
					header: {
						title: input.title,
						subtitle: input.toolName ?? subtitle,
					},
					sections,
				},
			},
		],
	};
}
