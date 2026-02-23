/**
 * System prompts for issue AI operations.
 * Pure functions — no runtime dependencies.
 */

export function issueAutoTriagePrompt(context: {
	title: string;
	description?: string;
	existingLabels: string[];
}): string {
	const descBlock = context.description
		? `\nDescription: ${context.description}`
		: "";
	const labelsBlock =
		context.existingLabels.length > 0
			? `\nAvailable labels in this workspace: ${context.existingLabels.join(", ")}`
			: "";

	return `You are a project management assistant. Analyze this issue and suggest triage metadata.

Issue title: ${context.title}${descBlock}${labelsBlock}

Respond with a JSON object (no markdown code fences):
{
  "priority": "urgent" | "high" | "medium" | "low",
  "type": "bug" | "feature" | "improvement" | "task" | "chore",
  "labels": ["label1", "label2"],
  "reasoning": "Brief explanation of why these values were chosen"
}

Choose labels from the available labels if provided. If none match, suggest new ones. Keep labels to 2-4 maximum.`;
}

export function issueDraftDescriptionPrompt(context: {
	title: string;
	priority?: string;
	type?: string;
}): string {
	const metaBlock = [
		context.priority ? `Priority: ${context.priority}` : null,
		context.type ? `Type: ${context.type}` : null,
	]
		.filter(Boolean)
		.join(", ");
	const metaSuffix = metaBlock ? `\nMetadata: ${metaBlock}` : "";

	return `You are a project management assistant. Write a clear issue description based on the title. Include:
1. A brief problem statement
2. Expected behavior
3. Steps to reproduce (if it's a bug) or acceptance criteria (if it's a feature)

Issue title: ${context.title}${metaSuffix}

Write in markdown. Be concise and actionable. Do not repeat the title.`;
}

export function issueDetectDuplicatesPrompt(context: {
	title: string;
	description?: string;
	existingIssues: Array<{ identifier: string; title: string }>;
}): string {
	const descBlock = context.description
		? `\nDescription: ${context.description}`
		: "";
	const issuesList = context.existingIssues
		.map((i) => `- ${i.identifier}: ${i.title}`)
		.join("\n");

	return `Analyze whether this new issue is a duplicate of any existing issues.

New issue title: ${context.title}${descBlock}

Existing issues:
${issuesList}

Respond with a JSON object (no markdown code fences):
{
  "duplicates": [
    { "identifier": "ISSUE-ID", "similarity": 0.0-1.0, "reason": "brief explanation" }
  ]
}

Only include issues with similarity > 0.5. If no duplicates, return { "duplicates": [] }.`;
}

export function issueSummarizeActivityPrompt(context: {
	title: string;
	description?: string;
	comments: Array<{ author: string; body: string }>;
}): string {
	const descBlock = context.description
		? `\nDescription: ${context.description}`
		: "";
	const commentsList = context.comments
		.map((c) => `@${c.author}: ${c.body}`)
		.join("\n\n");

	return `Summarize the activity on this issue. Highlight key decisions, open questions, and suggested next steps.

Issue: ${context.title}${descBlock}

Activity:
${commentsList}

Write a concise summary in 2-3 paragraphs.`;
}

export function issueReplyCommentPrompt(context: {
	issueTitle: string;
	commentBody: string;
	commentAuthor: string;
}): string {
	return `You are a helpful AI assistant in a project management tool. Write a thoughtful reply to this comment.

Issue: ${context.issueTitle}
Comment by @${context.commentAuthor}:
${context.commentBody}

Write a helpful, concise reply. Be constructive and actionable.`;
}

export function issueAIMentionPrompt(context: {
	issueTitle: string;
	issueDescription?: string;
	mentionPrompt: string;
	threadContext?: string;
}): string {
	const descBlock = context.issueDescription
		? `\nDescription: ${context.issueDescription}`
		: "";
	const threadBlock = context.threadContext
		? `\nConversation so far:\n${context.threadContext}\n`
		: "";

	return `You are Clave AI, a workspace assistant embedded in a project management tool. A user mentioned @AI in a comment and needs your help.

Context: ${context.issueTitle}${descBlock}
${threadBlock}
User's message: ${context.mentionPrompt}

Respond helpfully and concisely. Keep your answer focused and actionable. Do not use markdown headings. Use plain text with bullet points if needed.`;
}
