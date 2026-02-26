import type { GoogleChatActionResponseType } from "./interaction-contract";

type GoogleChatButton = {
	text: string;
	onClick: {
		openLink: {
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
				buttonList: {
					buttons: GoogleChatButton[];
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

export type GoogleChatActionCardResponse = {
	actionResponse: {
		type: GoogleChatActionResponseType;
	};
	text: string;
	fallbackText: string;
	cardsV2: GoogleChatCardWithId[];
};

export type GoogleChatIssueActionCardInput = {
	responseType: GoogleChatActionResponseType;
	resultType: "success" | "failure" | "permission_denied";
	title: string;
	message: string;
	issueIdentifier?: string;
	issueTitle?: string;
	issueStatus?: string;
	assigneeName?: string;
	deepLinkUrl?: string;
};

function toReadableStatus(status: string | undefined): string | null {
	if (!status) return null;
	return status.replaceAll("_", " ");
}

function escapeCardText(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function buildContextLine(input: GoogleChatIssueActionCardInput): string {
	const parts: string[] = [];
	if (input.issueIdentifier) parts.push(input.issueIdentifier);
	if (input.issueTitle) parts.push(input.issueTitle);
	const readableStatus = toReadableStatus(input.issueStatus);
	if (readableStatus) parts.push(`Status: ${readableStatus}`);
	if (input.assigneeName) parts.push(`Assignee: ${input.assigneeName}`);
	return parts.join(" · ");
}

export function buildGoogleChatIssueActionCard(
	input: GoogleChatIssueActionCardInput,
): GoogleChatActionCardResponse {
	const contextLine = buildContextLine(input);
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

	if (contextLine) {
		sections.push({
			widgets: [
				{
					textParagraph: {
						text: `<b>Issue:</b> ${escapeCardText(contextLine)}`,
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

	const subtitle =
		input.resultType === "success"
			? "Action completed"
			: input.resultType === "permission_denied"
				? "Permission denied"
				: "Action failed";

	return {
		actionResponse: {
			type: input.responseType,
		},
		text: `${input.title}: ${input.message}`,
		fallbackText: `${input.title}: ${input.message}`,
		cardsV2: [
			{
				cardId: "clave-issue-action",
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
