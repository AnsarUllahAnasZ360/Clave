/**
 * Extract human-readable text from persisted Excalidraw `sceneData` for AI agents.
 * Supports legacy array format and `serializeAsJSON` object shape (`elements` + optional `files`).
 */

export type BoardTextItem = {
	id: string;
	kind: string;
	text: string;
};

/** Max characters per markdown chunk returned to the model (stay under tool output limits). */
export const BOARD_EXPORT_CHUNK_CHARS = 24_000;

export function getSceneElementsArray(
	sceneData: string | undefined,
): unknown[] {
	if (!sceneData) return [];
	try {
		const parsed = JSON.parse(sceneData) as unknown;
		if (Array.isArray(parsed)) return parsed;
		if (
			parsed &&
			typeof parsed === "object" &&
			"elements" in parsed &&
			Array.isArray((parsed as { elements: unknown }).elements)
		) {
			return (parsed as { elements: unknown[] }).elements;
		}
	} catch {
		return [];
	}
	return [];
}

export function extractBoardTextItems(elements: unknown[]): BoardTextItem[] {
	const items: BoardTextItem[] = [];
	const elementMap = new Map<string, Record<string, unknown>>();
	for (const raw of elements) {
		if (!raw || typeof raw !== "object") continue;
		const el = raw as Record<string, unknown>;
		const id = el.id;
		if (typeof id === "string") elementMap.set(id, el);
	}

	function getBoundText(el: Record<string, unknown>): string | null {
		const direct = el.text;
		if (typeof direct === "string" && direct.trim()) return direct.trim();
		const label = el.label as { text?: string } | undefined;
		if (label?.text && typeof label.text === "string") return label.text.trim();
		const boundElements = el.boundElements as
			| Array<{ id: string; type: string }>
			| undefined;
		if (boundElements) {
			const textBinding = boundElements.find((b) => b.type === "text");
			if (textBinding) {
				const textEl = elementMap.get(textBinding.id);
				if (textEl && typeof textEl.text === "string")
					return textEl.text.trim();
			}
		}
		return null;
	}

	for (const raw of elements) {
		if (!raw || typeof raw !== "object") continue;
		const el = raw as Record<string, unknown>;
		if (el.isDeleted) continue;
		const id = typeof el.id === "string" ? el.id : "unknown";
		const type = typeof el.type === "string" ? el.type : "unknown";

		if (type === "text" && el.containerId) {
			continue;
		}

		const text = getBoundText(el);
		if (text) {
			items.push({ id, kind: type, text });
		}
	}

	return items;
}

export function itemsToMarkdown(items: BoardTextItem[]): string {
	if (items.length === 0) return "";
	const lines: string[] = [];
	for (let i = 0; i < items.length; i++) {
		const it = items[i];
		if (!it) continue;
		lines.push(`${i + 1}. [${it.kind}] ${it.text}`);
	}
	return lines.join("\n");
}

export function chunkString(s: string, maxChars: number): string[] {
	if (s.length <= maxChars) return [s];
	const chunks: string[] = [];
	for (let i = 0; i < s.length; i += maxChars) {
		chunks.push(s.slice(i, i + maxChars));
	}
	return chunks;
}
