import type { WorkspaceContext } from "./slash-commands";

// ── Page-specific summarize prompts ───────────────────────────────────────

/**
 * Build a context-aware user prompt for the /summarize command.
 * The prompt instructs the agent which tools to call and how to format output.
 */
export function buildSummarizePrompt(
	context?: WorkspaceContext,
	args?: string,
): string {
	// If the user provided specific text to summarize, honour that
	if (args?.trim()) {
		return `Summarize the following: ${args.trim()}`;
	}

	const pageType = context?.pageType ?? "unknown";
	const entityId = context?.entityId;
	const entityName = context?.entityName;

	switch (pageType) {
		case "project":
			return [
				`Summarize the current project${entityName ? ` "${entityName}"` : ""}.`,
				entityId
					? `Use the getProjectDetails tool with projectId "${entityId}" to fetch full project details.`
					: "Use the listProjects tool to identify the relevant project.",
				`Then use the searchIssues tool${entityId ? ` with projectId "${entityId}"` : ""} to get issue counts by status.`,
				"Use the listSprints tool to check sprint progress if any sprints exist.",
				"",
				"Format your response as:",
				"## Project Summary",
				"A 2-3 sentence overview of the project's current state.",
				"",
				"## Status",
				"Key metrics: total issues, open vs closed, sprint progress %.",
				"",
				"## Open Issues",
				"Count by priority (urgent, high, medium, low). List the top 3 highest-priority open issues.",
				"",
				"## Recent Activity",
				"Mention any recently completed or in-progress items.",
				"",
				"## Risks & Blockers",
				"Highlight any urgent issues, overdue items, or blockers. Say 'None identified' if clear.",
			].join("\n");

		case "document":
			return [
				`Summarize the document${entityName ? ` "${entityName}"` : ""} I'm currently viewing.`,
				entityId
					? `Use the getDocument tool with documentId "${entityId}" to fetch the content.`
					: "",
				"",
				"Format your response as:",
				"## Document Summary",
				"A concise 3-5 sentence summary of the document's content and purpose.",
				"",
				"## Key Points",
				"- 3-5 bullet points capturing the most important information.",
				"",
				"## Action Items",
				"List any action items, TODOs, or next steps mentioned in the document. Say 'None found' if there are no action items.",
			]
				.filter(Boolean)
				.join("\n");

		case "issue":
			return [
				`Summarize the issue${entityName ? ` ${entityName}` : ""} I'm currently viewing.`,
				entityId
					? `Use the getIssueDetails tool with issueId "${entityId}" to fetch full details.`
					: "",
				"",
				"Format your response as:",
				"## Issue Summary",
				"A 2-3 sentence summary of the issue, its current status, and priority.",
				"",
				"## Details",
				"Status, priority, assignee, labels, sprint, and dates.",
				"",
				"## Description",
				"A brief summary of the issue description.",
				"",
				"## Recommendations",
				"Any suggestions based on the issue's state (e.g., 'This high-priority issue has no assignee').",
			]
				.filter(Boolean)
				.join("\n");

		case "board":
			return [
				`Summarize the whiteboard${entityName ? ` "${entityName}"` : ""} I'm currently viewing.`,
				"Describe what you can infer about the board's purpose and content.",
				"If you have access to related project data, include relevant context.",
			].join("\n");

		default:
			// Dashboard or unknown page — workspace-level digest
			return [
				"Provide a workspace activity digest.",
				"Use the listProjects tool to get all projects and their statuses.",
				"Use the searchIssues tool to find urgent and high-priority open issues.",
				"Use the listSprints tool to check for any active sprints.",
				"",
				"Format your response as:",
				"## Workspace Overview",
				"A 2-3 sentence summary of the workspace's current state.",
				"",
				"## Active Projects",
				"List projects with their status and key metrics.",
				"",
				"## Urgent & High Priority Items",
				"List any urgent or high-priority open issues across all projects.",
				"",
				"## Sprint Progress",
				"Summarize any active sprints with completion percentages.",
				"",
				"## Recommendations",
				"Highlight items that need attention.",
			].join("\n");
	}
}

/**
 * Build a system prompt suffix for the /summarize command.
 * This is appended to the agent's system prompt for the specific message.
 * Uses clear delimiters so STORY-021 and STORY-022 can append their own sections.
 */
export function buildSummarizeSystemSuffix(context?: WorkspaceContext): string {
	const pageType = context?.pageType ?? "unknown";

	return [
		"",
		"--- [SUMMARIZE COMMAND] ---",
		"The user has invoked the /summarize command. Follow these rules:",
		"1. Use the appropriate read tools to fetch CURRENT data — do not guess or use stale information.",
		"2. Produce a well-structured markdown summary with clear headers (##) and bullet points.",
		"3. Be concise and human-readable — write like a teammate giving a brief, not a data dump.",
		"4. Use past tense for completed activities, present tense for current state.",
		"5. Proactively highlight risks, blockers, or items needing attention.",
		"6. If data is unavailable or tools return errors, say so clearly instead of fabricating information.",
		`7. Current page context: ${pageType}${context?.entityName ? ` — "${context.entityName}"` : ""}.`,
		"--- [/SUMMARIZE COMMAND] ---",
	].join("\n");
}
