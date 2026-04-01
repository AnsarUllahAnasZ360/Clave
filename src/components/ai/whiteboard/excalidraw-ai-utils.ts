/**
 * Utility functions for converting AI diagram output to native Excalidraw elements.
 * Converts an intermediate format (nodes + edges) into valid ExcalidrawElement[] objects.
 */

// ── Types ────────────────────────────────────────────────────────────────

/** Intermediate node from AI output */
export type AINode = {
	id: string;
	type?: "rectangle" | "ellipse" | "diamond" | "text";
	label: string;
	description?: string;
};

/** Intermediate edge from AI output */
export type AIEdge = {
	from: string;
	to: string;
	label?: string;
};

/** AI diagram output (intermediate format) */
export type AIDiagramOutput = {
	nodes?: AINode[];
	edges?: AIEdge[];
	elements?: Array<{
		type: string;
		x?: number;
		y?: number;
		width?: number;
		height?: number;
		text?: string;
		label?: { text?: string; fontSize?: number };
		strokeColor?: string;
		backgroundColor?: string;
		startBinding?: { elementId: string };
		endBinding?: { elementId: string };
		points?: number[][];
		endArrowhead?: string | null;
		id?: string;
	}>;
	description?: string;
};

/** Minimal Excalidraw element shape */
export type ExcalidrawElementLike = {
	id: string;
	type: string;
	x: number;
	y: number;
	width: number;
	height: number;
	angle: number;
	strokeColor: string;
	backgroundColor: string;
	fillStyle: string;
	strokeWidth: number;
	strokeStyle: string;
	roughness: number;
	opacity: number;
	groupIds: string[];
	frameId: null;
	index: string;
	roundness: { type: number } | null;
	seed: number;
	version: number;
	versionNonce: number;
	isDeleted: boolean;
	boundElements: Array<{ id: string; type: string }> | null;
	updated: number;
	link: null;
	locked: false;
	text?: string;
	fontSize?: number;
	fontFamily?: number;
	textAlign?: string;
	verticalAlign?: string;
	containerId?: string | null;
	originalText?: string;
	autoResize?: boolean;
	lineHeight?: number;
	points?: number[][];
	startBinding?: {
		elementId: string;
		focus: number;
		gap: number;
		fixedPoint: null;
	} | null;
	endBinding?: {
		elementId: string;
		focus: number;
		gap: number;
		fixedPoint: null;
	} | null;
	startArrowhead?: null;
	endArrowhead?: string | null;
	elbowed?: boolean;
};

// ── ID + Seed Generation ─────────────────────────────────────────────────

const CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";

export function generateExcalidrawId(): string {
	let result = "";
	for (let i = 0; i < 20; i++) {
		result += CHARS.charAt(Math.floor(Math.random() * CHARS.length));
	}
	return result;
}

function randomSeed(): number {
	return Math.floor(Math.random() * 2147483647);
}

function generateIndex(i: number): string {
	return `a${String(i).padStart(5, "0")}`;
}

// ── Element Factories ────────────────────────────────────────────────────

function baseElement(
	type: string,
	x: number,
	y: number,
	width: number,
	height: number,
	index: string,
): ExcalidrawElementLike {
	return {
		id: generateExcalidrawId(),
		type,
		x,
		y,
		width,
		height,
		angle: 0,
		strokeColor: "#1e1e1e",
		backgroundColor: "transparent",
		fillStyle: "solid",
		strokeWidth: 2,
		strokeStyle: "solid",
		roughness: 1,
		opacity: 100,
		groupIds: [],
		frameId: null,
		index,
		roundness:
			type === "rectangle" || type === "diamond"
				? { type: 3 }
				: type === "ellipse"
					? { type: 2 }
					: null,
		seed: randomSeed(),
		version: 1,
		versionNonce: randomSeed(),
		isDeleted: false,
		boundElements: null,
		updated: Date.now(),
		link: null,
		locked: false,
	};
}

export function createRectangleElement(
	config: {
		x: number;
		y: number;
		width: number;
		height: number;
		backgroundColor?: string;
		strokeColor?: string;
	},
	index: string,
): ExcalidrawElementLike {
	const el = baseElement(
		"rectangle",
		config.x,
		config.y,
		config.width,
		config.height,
		index,
	);
	if (config.backgroundColor) el.backgroundColor = config.backgroundColor;
	if (config.strokeColor) el.strokeColor = config.strokeColor;
	return el;
}

export function createEllipseElement(
	config: {
		x: number;
		y: number;
		width: number;
		height: number;
		backgroundColor?: string;
	},
	index: string,
): ExcalidrawElementLike {
	return {
		...baseElement(
			"ellipse",
			config.x,
			config.y,
			config.width,
			config.height,
			index,
		),
		backgroundColor: config.backgroundColor ?? "transparent",
	};
}

export function createDiamondElement(
	config: {
		x: number;
		y: number;
		width: number;
		height: number;
		backgroundColor?: string;
	},
	index: string,
): ExcalidrawElementLike {
	return {
		...baseElement(
			"diamond",
			config.x,
			config.y,
			config.width,
			config.height,
			index,
		),
		backgroundColor: config.backgroundColor ?? "transparent",
	};
}

export function createTextElement(
	config: {
		x: number;
		y: number;
		text: string;
		width?: number;
		height?: number;
		fontSize?: number;
		containerId?: string;
	},
	index: string,
): ExcalidrawElementLike {
	const fontSize = config.fontSize ?? 16;
	const normalizedText = config.text.replace(/\r/g, "");
	const lines = normalizedText.split("\n");
	const longestLineLength = Math.max(...lines.map((line) => line.length), 1);
	// Virgil (fontFamily 1) glyphs are wider than standard fonts — use 0.65
	const estimatedWidth = longestLineLength * fontSize * 0.65;
	const estimatedHeight = lines.length * fontSize * 1.25;
	const width = config.width ?? estimatedWidth;
	// Guard against multi-line labels being persisted with a too-small fixed
	// height (causes clipped text until Excalidraw recomputes dimensions).
	const height = Math.max(config.height ?? estimatedHeight, estimatedHeight);
	const el: ExcalidrawElementLike = {
		...baseElement("text", config.x, config.y, width, height, index),
		text: config.text,
		fontSize,
		fontFamily: 1,
		textAlign: "center",
		verticalAlign: "middle",
		containerId: config.containerId ?? null,
		originalText: config.text,
		autoResize: true,
		lineHeight: 1.25,
		roundness: null,
	};
	// Bound text sits on a light-colored shape bg → dark text is fine.
	// Standalone text renders directly on the canvas — use a light color
	// so it is visible on Excalidraw's dark theme (Clave is dark-mode first).
	if (!config.containerId) {
		el.strokeColor = "#f5f5f5";
	}
	return el;
}

export function createArrowElement(
	config: {
		startX: number;
		startY: number;
		endX: number;
		endY: number;
		startBinding?: { elementId: string };
		endBinding?: { elementId: string };
		label?: string;
	},
	index: string,
): ExcalidrawElementLike {
	const dx = config.endX - config.startX;
	const dy = config.endY - config.startY;
	return {
		...baseElement("arrow", config.startX, config.startY, dx, dy, index),
		points: [
			[0, 0],
			[dx, dy],
		],
		startBinding: config.startBinding
			? {
					elementId: config.startBinding.elementId,
					focus: 0,
					gap: 1,
					fixedPoint: null,
				}
			: null,
		endBinding: config.endBinding
			? {
					elementId: config.endBinding.elementId,
					focus: 0,
					gap: 1,
					fixedPoint: null,
				}
			: null,
		startArrowhead: null,
		endArrowhead: "arrow",
		roundness: { type: 2 },
		elbowed: false,
	};
}

// ── Position Helpers ─────────────────────────────────────────────────────

/**
 * Compute the bounding box of existing elements.
 * Returns null if no elements exist.
 */
function getBoundingBox(
	elements: Array<{ x: number; y: number; width: number; height: number }>,
) {
	if (elements.length === 0) return null;
	let minX = Number.POSITIVE_INFINITY;
	let minY = Number.POSITIVE_INFINITY;
	let maxX = Number.NEGATIVE_INFINITY;
	let maxY = Number.NEGATIVE_INFINITY;

	for (const el of elements) {
		minX = Math.min(minX, el.x);
		minY = Math.min(minY, el.y);
		maxX = Math.max(maxX, el.x + el.width);
		maxY = Math.max(maxY, el.y + el.height);
	}

	return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
}

/**
 * Offset new elements to avoid overlapping with existing canvas content.
 * If no existing elements, center at (100, 100).
 */
export function positionNewElements(
	existingElements: Array<{
		x: number;
		y: number;
		width: number;
		height: number;
		isDeleted?: boolean;
	}>,
	newElements: ExcalidrawElementLike[],
): ExcalidrawElementLike[] {
	const active = existingElements.filter((e) => !e.isDeleted);
	const existingBB = getBoundingBox(active);
	const newBB = getBoundingBox(newElements);

	if (!newBB) return newElements;

	let offsetX: number;
	let offsetY: number;

	if (!existingBB) {
		// Empty canvas — center new elements
		offsetX = 100 - newBB.minX;
		offsetY = 100 - newBB.minY;
	} else {
		// Position to the right of existing content with 200px gap
		offsetX = existingBB.maxX + 200 - newBB.minX;
		offsetY = existingBB.minY - newBB.minY;
	}

	return newElements.map((el) => ({
		...el,
		x: el.x + offsetX,
		y: el.y + offsetY,
	}));
}

// ── Main Parser: AI Output → Excalidraw Elements ─────────────────────────

const NODE_WIDTH = 160;
const NODE_HEIGHT = 60;
const H_SPACING = 220;
const V_SPACING = 140;

/**
 * Convert AI diagram output (intermediate format) to valid Excalidraw elements.
 * Handles both the nodes+edges format and the direct elements format.
 */
export function parseAIElementsToExcalidraw(
	aiOutput: AIDiagramOutput,
): ExcalidrawElementLike[] {
	// If AI returned direct elements array, convert those
	if (aiOutput.elements && !aiOutput.nodes) {
		return convertDirectElements(aiOutput.elements);
	}

	// Otherwise, use nodes+edges format
	const nodes = aiOutput.nodes ?? [];
	const edges = aiOutput.edges ?? [];
	const elements: ExcalidrawElementLike[] = [];
	let indexCounter = 0;

	// Layout nodes in a grid
	const cols = Math.ceil(Math.sqrt(nodes.length));
	const nodePositions = new Map<
		string,
		{ x: number; y: number; elementId: string }
	>();

	for (let i = 0; i < nodes.length; i++) {
		const node = nodes[i];
		const col = i % cols;
		const row = Math.floor(i / cols);
		const x = col * H_SPACING;
		const y = row * V_SPACING;

		// Determine shape type
		const shapeType = node.type ?? "rectangle";

		let shapeEl: ExcalidrawElementLike;
		const idx = generateIndex(indexCounter++);
		switch (shapeType) {
			case "ellipse":
				shapeEl = createEllipseElement(
					{
						x,
						y,
						width: NODE_WIDTH,
						height: NODE_HEIGHT,
						backgroundColor: "#e3f2fd",
					},
					idx,
				);
				break;
			case "diamond":
				shapeEl = createDiamondElement(
					{
						x,
						y,
						width: NODE_WIDTH,
						height: NODE_HEIGHT,
						backgroundColor: "#fff3e0",
					},
					idx,
				);
				break;
			default:
				shapeEl = createRectangleElement(
					{
						x,
						y,
						width: NODE_WIDTH,
						height: NODE_HEIGHT,
						backgroundColor: "#e8f5e9",
					},
					idx,
				);
				break;
		}

		// Create text label inside the shape
		const textEl = createTextElement(
			{
				x: x + NODE_WIDTH / 2,
				y: y + NODE_HEIGHT / 2,
				text: node.label,
				fontSize: 16,
				containerId: shapeEl.id,
			},
			generateIndex(indexCounter++),
		);

		// Link text to shape
		shapeEl.boundElements = [{ id: textEl.id, type: "text" }];

		elements.push(shapeEl);
		elements.push(textEl);

		nodePositions.set(node.id, {
			x: x + NODE_WIDTH / 2,
			y: y + NODE_HEIGHT / 2,
			elementId: shapeEl.id,
		});
	}

	// Create arrows for edges
	for (const edge of edges) {
		const fromPos = nodePositions.get(edge.from);
		const toPos = nodePositions.get(edge.to);
		if (!fromPos || !toPos) continue;

		const arrowEl = createArrowElement(
			{
				startX: fromPos.x,
				startY: fromPos.y,
				endX: toPos.x,
				endY: toPos.y,
				startBinding: { elementId: fromPos.elementId },
				endBinding: { elementId: toPos.elementId },
				label: edge.label,
			},
			generateIndex(indexCounter++),
		);

		// Add arrow to shape boundElements
		const fromShape = elements.find((e) => e.id === fromPos.elementId);
		const toShape = elements.find((e) => e.id === toPos.elementId);
		if (fromShape) {
			fromShape.boundElements = [
				...(fromShape.boundElements ?? []),
				{ id: arrowEl.id, type: "arrow" },
			];
		}
		if (toShape) {
			toShape.boundElements = [
				...(toShape.boundElements ?? []),
				{ id: arrowEl.id, type: "arrow" },
			];
		}

		elements.push(arrowEl);
	}

	return elements;
}

// ── Canvas Serialization for AI ───────────────────────────────────────────

/**
 * Extract bound text content from a shape element.
 * Shapes may have text elements linked via `boundElements` with type "text".
 */
export function extractBoundText(
	element: ExcalidrawElementLike,
	allElements: ExcalidrawElementLike[],
): string | null {
	if (element.text) return element.text;
	const textBinding = element.boundElements?.find((b) => b.type === "text");
	if (!textBinding) return null;
	const textEl = allElements.find((e) => e.id === textBinding.id);
	return textEl?.text ?? null;
}

/**
 * Serialize canvas elements into a compact text description for AI.
 * Much more token-efficient than raw Excalidraw JSON.
 *
 * Truncates to MAX_ELEMENTS to stay within token limits for large canvases.
 */
const MAX_SERIALIZE_ELEMENTS = 80;

export function serializeCanvasForAI(
	elements: ExcalidrawElementLike[],
): string {
	const active = elements.filter((e) => !e.isDeleted);

	if (active.length === 0) return "(empty canvas)";

	// Separate shapes, text (standalone), and arrows
	const shapes = active.filter(
		(e) =>
			e.type === "rectangle" ||
			e.type === "ellipse" ||
			e.type === "diamond" ||
			e.type === "freedraw",
	);
	const standaloneText = active.filter(
		(e) => e.type === "text" && !e.containerId,
	);
	const arrows = active.filter((e) => e.type === "arrow" || e.type === "line");

	// Truncate if too many elements
	const truncated = active.length > MAX_SERIALIZE_ELEMENTS;
	const lines: string[] = [];

	lines.push(`Canvas: ${active.length} elements total`);
	lines.push("");

	// Describe shapes with their labels
	if (shapes.length > 0) {
		lines.push("Shapes:");
		for (const shape of shapes.slice(0, 40)) {
			const label = extractBoundText(shape, active);
			const labelStr = label ? ` "${label}"` : "";
			lines.push(
				`  - ${shape.type}${labelStr} [id:${shape.id.slice(0, 8)}] at (${Math.round(shape.x)},${Math.round(shape.y)}) size ${Math.round(shape.width)}x${Math.round(shape.height)}`,
			);
		}
		if (shapes.length > 40) {
			lines.push(`  ... and ${shapes.length - 40} more shapes`);
		}
	}

	// Describe standalone text
	if (standaloneText.length > 0) {
		lines.push("");
		lines.push("Text labels:");
		for (const t of standaloneText.slice(0, 20)) {
			lines.push(`  - "${t.text}" at (${Math.round(t.x)},${Math.round(t.y)})`);
		}
	}

	// Describe connections
	if (arrows.length > 0) {
		lines.push("");
		lines.push("Connections:");
		for (const arrow of arrows.slice(0, 30)) {
			const fromId = arrow.startBinding?.elementId?.slice(0, 8) ?? "?";
			const toId = arrow.endBinding?.elementId?.slice(0, 8) ?? "?";
			const fromShape = arrow.startBinding
				? active.find((e) => e.id === arrow.startBinding?.elementId)
				: null;
			const toShape = arrow.endBinding
				? active.find((e) => e.id === arrow.endBinding?.elementId)
				: null;
			const fromLabel = fromShape ? extractBoundText(fromShape, active) : null;
			const toLabel = toShape ? extractBoundText(toShape, active) : null;
			const fromStr = fromLabel ? `"${fromLabel}"` : `[${fromId}]`;
			const toStr = toLabel ? `"${toLabel}"` : `[${toId}]`;
			lines.push(`  - ${fromStr} → ${toStr}`);
		}
	}

	if (truncated) {
		lines.push("");
		lines.push(
			`(Showing ${MAX_SERIALIZE_ELEMENTS} of ${active.length} elements)`,
		);
	}

	return lines.join("\n");
}

// ── Auto Layout ───────────────────────────────────────────────────────────

type LayoutPosition = { id: string; x: number; y: number };

/**
 * Compute a clean auto-layout for existing canvas elements.
 * Uses topological ordering for connected elements (left-to-right flow),
 * then places unconnected elements in a grid below.
 *
 * Returns new positions for each element (only shapes, not text/arrows).
 */
export function computeAutoLayout(
	elements: ExcalidrawElementLike[],
): LayoutPosition[] {
	const active = elements.filter((e) => !e.isDeleted);
	const shapes = active.filter(
		(e) =>
			e.type === "rectangle" || e.type === "ellipse" || e.type === "diamond",
	);
	const arrows = active.filter((e) => e.type === "arrow");

	if (shapes.length === 0) return [];

	// Build adjacency lists from arrows
	const outEdges = new Map<string, string[]>();
	const inDegree = new Map<string, number>();
	const shapeIds = new Set(shapes.map((s) => s.id));

	for (const id of shapeIds) {
		outEdges.set(id, []);
		inDegree.set(id, 0);
	}

	for (const arrow of arrows) {
		const from = arrow.startBinding?.elementId;
		const to = arrow.endBinding?.elementId;
		if (from && to && shapeIds.has(from) && shapeIds.has(to)) {
			outEdges.get(from)?.push(to);
			inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
		}
	}

	// Kahn's topological sort to determine layers
	const queue: string[] = [];
	for (const [id, deg] of inDegree) {
		if (deg === 0) queue.push(id);
	}

	const layers: string[][] = [];
	const visited = new Set<string>();
	while (queue.length > 0) {
		const layer = [...queue];
		layers.push(layer);
		queue.length = 0;
		for (const id of layer) {
			visited.add(id);
			for (const next of outEdges.get(id) ?? []) {
				const newDeg = (inDegree.get(next) ?? 1) - 1;
				inDegree.set(next, newDeg);
				if (newDeg === 0 && !visited.has(next)) {
					queue.push(next);
				}
			}
		}
	}

	// Add unvisited nodes (disconnected or in cycles) as a final layer
	const unvisited = shapes.filter((s) => !visited.has(s.id)).map((s) => s.id);
	if (unvisited.length > 0) layers.push(unvisited);

	// Assign positions: layers go left-to-right, elements within a layer top-to-bottom
	const LAYOUT_H_SPACING = 240;
	const LAYOUT_V_SPACING = 120;
	const START_X = 100;
	const START_Y = 100;

	const positions: LayoutPosition[] = [];

	for (let col = 0; col < layers.length; col++) {
		const layer = layers[col];
		// Center the layer vertically
		const totalHeight = layer.length * LAYOUT_V_SPACING;
		const startY = START_Y + (totalHeight > 0 ? -totalHeight / 2 : 0);

		for (let row = 0; row < layer.length; row++) {
			positions.push({
				id: layer[row],
				x: START_X + col * LAYOUT_H_SPACING,
				y: startY + row * LAYOUT_V_SPACING,
			});
		}
	}

	// Also reposition bound text and arrows (they'll follow their containers)
	return positions;
}

/**
 * Convert direct element format from AI (simpler format with type, x, y, width, height, text).
 */
function convertDirectElements(
	rawElements: Array<{
		type: string;
		x?: number;
		y?: number;
		width?: number;
		height?: number;
		text?: string;
		label?: { text?: string; fontSize?: number };
		strokeColor?: string;
		backgroundColor?: string;
		startBinding?: { elementId: string };
		endBinding?: { elementId: string };
		points?: number[][];
		endArrowhead?: string | null;
		id?: string;
	}>,
): ExcalidrawElementLike[] {
	const elements: ExcalidrawElementLike[] = [];
	let indexCounter = 0;

	// Map AI IDs to Excalidraw IDs for binding resolution
	const idMap = new Map<string, string>();
	for (const raw of rawElements) {
		if (raw.id) {
			const eid = generateExcalidrawId();
			idMap.set(raw.id, eid);
		}
	}

	for (const raw of rawElements) {
		const x = raw.x ?? 0;
		const y = raw.y ?? 0;
		const width = raw.width ?? NODE_WIDTH;
		const height = raw.height ?? NODE_HEIGHT;
		const idx = generateIndex(indexCounter++);

		switch (raw.type) {
			case "cameraUpdate":
			case "restoreCheckpoint":
			case "delete":
				// Pseudo-elements used by Excalidraw MCP app. They are not drawable canvas elements.
				break;
			case "rectangle": {
				const el = createRectangleElement(
					{
						x,
						y,
						width,
						height,
						backgroundColor: raw.backgroundColor,
						strokeColor: raw.strokeColor,
					},
					idx,
				);
				if (raw.id) {
					const mappedId = idMap.get(raw.id);
					if (mappedId) el.id = mappedId;
				}
				elements.push(el);
				const labelText = raw.text ?? raw.label?.text;
				if (labelText) {
					const labelFontSize = raw.label?.fontSize ?? 16;
					const textEl = createTextElement(
						{
							x: x + width / 2,
							y: y + height / 2,
							text: labelText,
							fontSize: labelFontSize,
							containerId: el.id,
						},
						generateIndex(indexCounter++),
					);
					el.boundElements = [{ id: textEl.id, type: "text" }];
					elements.push(textEl);
				}
				break;
			}
			case "ellipse": {
				const el = createEllipseElement(
					{ x, y, width, height, backgroundColor: raw.backgroundColor },
					idx,
				);
				if (raw.id) {
					const mappedId = idMap.get(raw.id);
					if (mappedId) el.id = mappedId;
				}
				elements.push(el);
				const labelText = raw.text ?? raw.label?.text;
				if (labelText) {
					const labelFontSize = raw.label?.fontSize ?? 16;
					const textEl = createTextElement(
						{
							x: x + width / 2,
							y: y + height / 2,
							text: labelText,
							fontSize: labelFontSize,
							containerId: el.id,
						},
						generateIndex(indexCounter++),
					);
					el.boundElements = [{ id: textEl.id, type: "text" }];
					elements.push(textEl);
				}
				break;
			}
			case "diamond": {
				const el = createDiamondElement(
					{ x, y, width, height, backgroundColor: raw.backgroundColor },
					idx,
				);
				if (raw.id) {
					const mappedId = idMap.get(raw.id);
					if (mappedId) el.id = mappedId;
				}
				elements.push(el);
				const labelText = raw.text ?? raw.label?.text;
				if (labelText) {
					const labelFontSize = raw.label?.fontSize ?? 16;
					const textEl = createTextElement(
						{
							x: x + width / 2,
							y: y + height / 2,
							text: labelText,
							fontSize: labelFontSize,
							containerId: el.id,
						},
						generateIndex(indexCounter++),
					);
					el.boundElements = [{ id: textEl.id, type: "text" }];
					elements.push(textEl);
				}
				break;
			}
			case "text": {
				const el = createTextElement(
					{
						x,
						y,
						text: raw.text ?? raw.label?.text ?? "",
						width,
						height,
						fontSize: raw.label?.fontSize,
					},
					idx,
				);
				elements.push(el);
				break;
			}
			case "arrow":
			case "line": {
				const resolvedStart = raw.startBinding?.elementId
					? (idMap.get(raw.startBinding.elementId) ??
						raw.startBinding.elementId)
					: undefined;
				const resolvedEnd = raw.endBinding?.elementId
					? (idMap.get(raw.endBinding.elementId) ?? raw.endBinding.elementId)
					: undefined;
				const el = createArrowElement(
					{
						startX: x,
						startY: y,
						endX: x + width,
						endY: y + height,
						startBinding: resolvedStart
							? { elementId: resolvedStart }
							: undefined,
						endBinding: resolvedEnd ? { elementId: resolvedEnd } : undefined,
					},
					idx,
				);
				elements.push(el);
				break;
			}
			default: {
				// Unknown type — create a rectangle as fallback
				const el = createRectangleElement({ x, y, width, height }, idx);
				elements.push(el);
				break;
			}
		}
	}

	return elements;
}
