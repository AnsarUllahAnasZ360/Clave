import type { ExcalidrawElementLike } from "./excalidraw-ai-utils";

const CONNECTOR_TYPES = new Set(["arrow", "line"]);

function chunk<T>(items: T[], size: number): T[][] {
	if (size <= 0) return [items];
	const chunks: T[][] = [];
	for (let i = 0; i < items.length; i += size) {
		chunks.push(items.slice(i, i + size));
	}
	return chunks;
}

/**
 * Build progressive insertion batches with connector-safe ordering:
 * 1) Non-connectors first (shapes + text)
 * 2) Connectors after bound targets are present
 */
export function buildProgressiveInsertionBatches(
	elements: ExcalidrawElementLike[],
	options?: {
		shapeBatchSize?: number;
		connectorBatchSize?: number;
	},
): ExcalidrawElementLike[][] {
	const shapeBatchSize = options?.shapeBatchSize ?? 6;
	const connectorBatchSize = options?.connectorBatchSize ?? 3;

	const ordered = elements.filter((element) => !element.isDeleted);
	const nonConnectors = ordered.filter(
		(element) => !CONNECTOR_TYPES.has(element.type),
	);
	const connectors = ordered.filter((element) =>
		CONNECTOR_TYPES.has(element.type),
	);

	return [
		...chunk(nonConnectors, shapeBatchSize),
		...chunk(connectors, connectorBatchSize),
	].filter((batch) => batch.length > 0);
}
