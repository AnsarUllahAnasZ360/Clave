/**
 * Extract embedded Excalidraw image file payloads from serialized scene JSON
 * so vision-capable chat models can receive them as user message image parts.
 */

/** Cap embedded images per message — vision APIs have strict limits. */
export const MAX_BOARD_VISION_IMAGES = 8;
/** Skip enormous data URLs (roughly > ~4MB base64) to avoid provider errors. */
export const MAX_IMAGE_DATA_URL_CHARS = 5_000_000;

export function extractEmbeddedBoardImages(sceneJson: string): Array<{
	url: string;
	mediaType: string;
}> {
	const out: Array<{ url: string; mediaType: string }> = [];
	let parsed: unknown;
	try {
		parsed = JSON.parse(sceneJson);
	} catch {
		return out;
	}
	if (!parsed || typeof parsed !== "object") return out;
	const files = (parsed as { files?: Record<string, { dataURL?: string }> })
		.files;
	if (!files || typeof files !== "object") return out;
	for (const file of Object.values(files)) {
		const dataURL = file?.dataURL;
		if (typeof dataURL !== "string") continue;
		if (!dataURL.startsWith("data:image/")) continue;
		if (dataURL.length > MAX_IMAGE_DATA_URL_CHARS) continue;
		const semi = dataURL.indexOf(";");
		// "data:image/png" -> semi after png
		if (semi <= 5) continue;
		const mediaType = dataURL.slice(5, semi) || "image/png";
		out.push({ url: dataURL, mediaType });
		if (out.length >= MAX_BOARD_VISION_IMAGES) break;
	}
	return out;
}
