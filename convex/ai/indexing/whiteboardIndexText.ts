/**
 * Pure helper: build the indexable text blob for a whiteboard from the raw
 * scene JSON and the persisted whiteboardImages metadata.
 *
 * Extracted from whiteboardIndexer.ts so it can be imported from tests and
 * non-node runtimes without pulling in the "use node" action file.
 */
import {
	extractBoardTextItems,
	getSceneElementsArray,
	itemsToMarkdown,
} from "../whiteboardSceneExport";

export function buildWhiteboardIndexText(
	title: string,
	sceneJson: string,
	images: Array<{ fileKey: string; ocrText?: string; caption?: string }>,
): string {
	const elements = getSceneElementsArray(sceneJson);
	const items = extractBoardTextItems(elements);
	const shapesText = itemsToMarkdown(items);

	const imageLines: string[] = [];
	for (const img of images) {
		const pieces: string[] = [];
		if (img.caption) pieces.push(`Caption: ${img.caption}`);
		if (img.ocrText) pieces.push(`OCR: ${img.ocrText}`);
		if (pieces.length > 0) {
			imageLines.push(`Image ${img.fileKey}: ${pieces.join(" — ")}`);
		}
	}

	return [
		title.trim() ? `# ${title.trim()}` : "",
		shapesText,
		imageLines.length > 0 ? imageLines.join("\n") : "",
	]
		.filter((s) => s && s.trim().length > 0)
		.join("\n\n")
		.trim();
}
