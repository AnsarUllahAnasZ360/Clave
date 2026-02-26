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

export type GoogleChatCardMessage = {
	text: string;
	fallbackText: string;
	cardsV2: GoogleChatCardWithId[];
};

export type GoogleChatNotificationCardInput = {
	eventType: string;
	title: string;
	body?: string;
	preview?: string;
	deepLinkUrl: string;
	actorName?: string;
	issueIdentifier?: string;
	issueTitle?: string;
	projectName?: string;
};

function toEventLabel(eventType: string): string {
	if (eventType.startsWith("issue_")) return "Issue";
	if (eventType === "comment" || eventType === "document_comment") {
		return "Comment";
	}
	if (eventType.endsWith("_update")) return "Update";
	return "Notification";
}

function escapeCardText(text: string): string {
	return text
		.replaceAll("&", "&amp;")
		.replaceAll("<", "&lt;")
		.replaceAll(">", "&gt;");
}

function buildContextLine(input: GoogleChatNotificationCardInput): string {
	const parts: string[] = [];
	if (input.actorName) parts.push(`By ${input.actorName}`);
	if (input.issueIdentifier) parts.push(input.issueIdentifier);
	if (input.issueTitle) parts.push(input.issueTitle);
	if (input.projectName) parts.push(`Project: ${input.projectName}`);
	return parts.join(" · ");
}

export function buildGoogleChatCardMessage(
	input: GoogleChatNotificationCardInput,
): GoogleChatCardMessage {
	const label = toEventLabel(input.eventType);
	const primaryText = input.body?.trim() || input.preview?.trim() || "";
	const contextLine = buildContextLine(input);
	const fallbackText = [input.title, primaryText, contextLine]
		.filter((value) => value.length > 0)
		.join(" — ");

	const cardSections: GoogleChatCardSection[] = [];
	if (primaryText) {
		cardSections.push({
			widgets: [
				{
					textParagraph: {
						text: escapeCardText(primaryText),
					},
				},
			],
		});
	}
	if (contextLine) {
		cardSections.push({
			widgets: [
				{
					textParagraph: {
						text: `<b>Context:</b> ${escapeCardText(contextLine)}`,
					},
				},
			],
		});
	}
	cardSections.push({
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

	return {
		text: fallbackText || input.title,
		fallbackText: fallbackText || input.title,
		cardsV2: [
			{
				cardId: `clave-${input.eventType}`,
				card: {
					header: {
						title: input.title,
						subtitle: label,
					},
					sections: cardSections,
				},
			},
		],
	};
}
