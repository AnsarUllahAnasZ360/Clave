/**
 * System prompts for document AI operations.
 * Pure functions — no runtime dependencies.
 */

export function documentContinuePrompt(context: {
	title: string;
	contentBefore: string;
}): string {
	return `You are a writing assistant embedded in a document editor. Continue writing naturally from where the content ends. Match the existing tone, style, and formatting.

Document title: ${context.title}
Content so far:
${context.contentBefore}

Continue writing. Do not repeat existing content. Do not include any preamble or explanation — just continue the text.`;
}

export function documentImprovePrompt(context: {
	title: string;
	selectedText: string;
}): string {
	return `You are a writing assistant. Improve the following text by making it clearer, more concise, and better structured. Preserve the original meaning and tone.

Document: ${context.title}
Text to improve:
${context.selectedText}

Return only the improved text. No explanations.`;
}

export function documentSummarizePrompt(context: {
	title: string;
	content: string;
}): string {
	return `Summarize the following document concisely. Focus on key points and main ideas.

Document: ${context.title}
Content:
${context.content}

Return a clear summary in 2-4 paragraphs.`;
}

export function documentRewritePrompt(context: {
	title: string;
	selectedText: string;
}): string {
	return `Rewrite the following text with a fresh perspective. Keep the same meaning but use different wording and structure.

Document: ${context.title}
Text to rewrite:
${context.selectedText}

Return only the rewritten text. No explanations.`;
}

export function documentTranslatePrompt(context: {
	selectedText: string;
	targetLanguage: string;
}): string {
	return `Translate the following text to ${context.targetLanguage}. Preserve formatting, tone, and meaning.

Text to translate:
${context.selectedText}

Return only the translated text.`;
}

export function documentExpandPrompt(context: {
	title: string;
	selectedText: string;
}): string {
	return `Expand the following text with more detail, examples, and explanation. Maintain the original style and tone.

Document: ${context.title}
Text to expand:
${context.selectedText}

Return the expanded version. No preamble.`;
}

export function documentFixGrammarPrompt(context: {
	selectedText: string;
}): string {
	return `Fix all grammar, spelling, and punctuation errors in the following text. Do not change the meaning or style — only correct errors.

Text:
${context.selectedText}

Return only the corrected text.`;
}

export function documentWriteFromPromptFn(context: {
	title: string;
	prompt: string;
	contentBefore?: string;
}): string {
	const contextBlock = context.contentBefore
		? `\nExisting content for context:\n${context.contentBefore}`
		: "";

	return `You are a writing assistant. Write content based on the user's instruction. Match the document's context and style.

Document: ${context.title}${contextBlock}

User instruction: ${context.prompt}

Write the requested content. No preamble or explanation — just the text.`;
}
