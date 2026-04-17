/**
 * Pure helper: prepend markdown image embeds for persisted whiteboard images
 * to an issue / project / sprint description, so the AI agent can ship a
 * board-derived plan with the relevant visuals inline.
 *
 * Kept separate from the Convex tool files so it can be unit-tested without
 * pulling in the `createTool` / approval runtime.
 */

export type BoardImageAttachment = {
	/** Stable URL used as the markdown image src. */
	url: string;
	/** Optional caption — becomes the markdown alt text. */
	caption?: string;
};

/**
 * Build a markdown fragment listing the given images. Empty attachments
 * return an empty string so callers can prepend unconditionally.
 */
export function buildBoardImagesMarkdown(
	attachments: BoardImageAttachment[],
): string {
	if (!attachments || attachments.length === 0) return "";
	const lines: string[] = ["## Attached from whiteboard", ""];
	for (const att of attachments) {
		const alt = (att.caption ?? "Whiteboard image").replace(/[[\]]/g, "");
		lines.push(`![${alt}](${att.url})`);
		if (att.caption) lines.push("");
		lines.push("");
	}
	return lines.join("\n").trimEnd();
}

/**
 * Prepend the rendered image block to an existing description. If the
 * description is empty, the image block stands on its own. Returns undefined
 * when there is nothing to attach and nothing to preserve so callers can pass
 * it straight into an optional description field.
 */
export function mergeDescriptionWithBoardImages(
	description: string | undefined,
	attachments: BoardImageAttachment[],
): string | undefined {
	const block = buildBoardImagesMarkdown(attachments);
	const body = description?.trim() ?? "";
	if (!block && !body) return undefined;
	if (!block) return body;
	if (!body) return block;
	return `${block}\n\n${body}`;
}
