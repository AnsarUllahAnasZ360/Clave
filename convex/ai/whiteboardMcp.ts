export type WhiteboardGenerationMode =
	| "wireframe"
	| "flowchart"
	| "architecture";

type UnknownTool = {
	execute?: (input: unknown, options: unknown) => Promise<unknown> | unknown;
};

const DRAWABLE_TYPES = new Set([
	"rectangle",
	"ellipse",
	"diamond",
	"text",
	"arrow",
	"line",
]);

const CONNECTOR_TYPES = new Set(["arrow", "line"]);
const SHAPE_TYPES = new Set(["rectangle", "ellipse", "diamond"]);

export interface ExcalidrawToolSelection {
	readMeName: string;
	createViewName: string;
}

export function selectOfficialExcalidrawTools(
	tools: Record<string, unknown>,
): ExcalidrawToolSelection | null {
	const readMe = Object.keys(tools).filter((name) => name.endsWith("_read_me"));
	const createView = Object.keys(tools).filter((name) =>
		name.endsWith("_create_view"),
	);
	if (readMe.length === 0 || createView.length === 0) return null;

	const byPrefix = new Map<string, { readMe?: string; createView?: string }>();
	for (const name of readMe) {
		const prefix = name.replace(/_read_me$/, "");
		const entry = byPrefix.get(prefix) ?? {};
		entry.readMe = name;
		byPrefix.set(prefix, entry);
	}
	for (const name of createView) {
		const prefix = name.replace(/_create_view$/, "");
		const entry = byPrefix.get(prefix) ?? {};
		entry.createView = name;
		byPrefix.set(prefix, entry);
	}

	const completePairs = Array.from(byPrefix.entries())
		.filter(([, value]) => value.readMe && value.createView)
		.map(([prefix, value]) => ({
			prefix,
			readMeName: value.readMe as string,
			createViewName: value.createView as string,
		}));
	if (completePairs.length === 0) return null;

	const excalidrawPair =
		completePairs.find((pair) => pair.prefix.includes("excalidraw")) ??
		completePairs[0];
	return {
		readMeName: excalidrawPair.readMeName,
		createViewName: excalidrawPair.createViewName,
	};
}

export function readToolText(output: unknown): string {
	if (typeof output === "string") return output;
	if (!output || typeof output !== "object") return "";
	const record = output as {
		content?: Array<{ type?: string; text?: string }>;
	};
	const textParts = (record.content ?? [])
		.filter((item) => item.type === "text" && typeof item.text === "string")
		.map((item) => item.text as string);
	return textParts.join("\n").trim();
}

export function getToolExecutor(
	tools: Record<string, unknown>,
	name: string,
): UnknownTool["execute"] | null {
	const candidate = tools[name] as UnknownTool | undefined;
	if (!candidate?.execute) return null;
	return candidate.execute;
}

function parseJsonText(text: string): unknown {
	const cleaned = text
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();

	try {
		return JSON.parse(cleaned);
	} catch {
		// fall through
	}

	const start = cleaned.search(/[{[]/);
	if (start === -1) return null;
	const open = cleaned[start];
	const close = open === "{" ? "}" : "]";
	let depth = 0;
	let inString = false;
	let escaping = false;

	for (let i = start; i < cleaned.length; i++) {
		const ch = cleaned[i];
		if (inString) {
			if (escaping) {
				escaping = false;
				continue;
			}
			if (ch === "\\") {
				escaping = true;
				continue;
			}
			if (ch === '"') {
				inString = false;
			}
			continue;
		}
		if (ch === '"') {
			inString = true;
			continue;
		}
		if (ch === open) {
			depth += 1;
			continue;
		}
		if (ch === close) {
			depth -= 1;
			if (depth === 0) {
				try {
					return JSON.parse(cleaned.slice(start, i + 1));
				} catch {
					return null;
				}
			}
		}
	}
	return null;
}

export function extractElementsPayload(payload: unknown): unknown[] {
	if (Array.isArray(payload)) return payload;
	if (!payload || typeof payload !== "object") return [];
	const record = payload as Record<string, unknown>;
	const direct = record.elements;
	if (Array.isArray(direct)) return direct;
	for (const key of ["data", "result", "view", "diagram"]) {
		const nested = record[key];
		if (Array.isArray(nested)) return nested;
		if (nested && typeof nested === "object") {
			const nestedElements = (nested as Record<string, unknown>).elements;
			if (Array.isArray(nestedElements)) return nestedElements;
		}
		if (typeof nested === "string") {
			const parsed = parseJsonText(nested);
			if (Array.isArray(parsed)) return parsed;
			if (
				parsed &&
				typeof parsed === "object" &&
				Array.isArray((parsed as Record<string, unknown>).elements)
			) {
				return (parsed as { elements: unknown[] }).elements;
			}
		}
	}
	return [];
}

export function sanitizeDrawableElements(
	elements: unknown[],
): Array<Record<string, unknown>> {
	const sanitized: Array<Record<string, unknown>> = [];
	for (const item of elements) {
		if (!item || typeof item !== "object") continue;
		const raw = item as Record<string, unknown>;
		const type = typeof raw.type === "string" ? raw.type : "";
		if (!DRAWABLE_TYPES.has(type)) continue;

		const candidate: Record<string, unknown> = {
			type,
		};
		if (typeof raw.id === "string" && raw.id.trim())
			candidate.id = raw.id.trim();
		for (const field of ["x", "y", "width", "height"] as const) {
			const value = raw[field];
			if (typeof value === "number" && Number.isFinite(value)) {
				candidate[field] = value;
			}
		}
		for (const field of [
			"text",
			"strokeColor",
			"backgroundColor",
			"fillStyle",
		] as const) {
			const value = raw[field];
			if (typeof value === "string" && value.length > 0) {
				candidate[field] = value;
			}
		}
		// Preserve roundness for rounded corners
		if (raw.roundness && typeof raw.roundness === "object") {
			const rt = (raw.roundness as { type?: unknown }).type;
			if (typeof rt === "number") {
				candidate.roundness = { type: rt };
			}
		}
		// Preserve opacity if explicitly set
		if (
			typeof raw.opacity === "number" &&
			Number.isFinite(raw.opacity) &&
			raw.opacity >= 0 &&
			raw.opacity <= 100
		) {
			candidate.opacity = raw.opacity;
		}
		// Preserve strokeWidth
		if (
			typeof raw.strokeWidth === "number" &&
			Number.isFinite(raw.strokeWidth) &&
			raw.strokeWidth > 0
		) {
			candidate.strokeWidth = raw.strokeWidth;
		}
		// Preserve fontSize for standalone text elements
		if (
			typeof raw.fontSize === "number" &&
			Number.isFinite(raw.fontSize) &&
			raw.fontSize > 0
		) {
			candidate.fontSize = raw.fontSize;
		}
		if (Array.isArray(raw.points)) {
			const points = raw.points
				.map((point) =>
					Array.isArray(point) &&
					point.length >= 2 &&
					typeof point[0] === "number" &&
					typeof point[1] === "number"
						? [point[0], point[1]]
						: null,
				)
				.filter((point): point is [number, number] => Boolean(point));
			if (points.length > 0) candidate.points = points;
		}
		if (typeof raw.endArrowhead === "string" || raw.endArrowhead === null) {
			candidate.endArrowhead = raw.endArrowhead;
		}
		if (raw.label && typeof raw.label === "object") {
			const label = raw.label as { text?: unknown; fontSize?: unknown };
			const nextLabel: Record<string, unknown> = {};
			if (typeof label.text === "string" && label.text.trim()) {
				nextLabel.text = label.text;
			}
			if (
				typeof label.fontSize === "number" &&
				Number.isFinite(label.fontSize) &&
				label.fontSize > 0
			) {
				nextLabel.fontSize = label.fontSize;
			}
			if (Object.keys(nextLabel).length > 0) {
				candidate.label = nextLabel;
			}
		}
		for (const bindingKey of ["startBinding", "endBinding"] as const) {
			const binding = raw[bindingKey];
			if (binding && typeof binding === "object") {
				const b = binding as {
					elementId?: unknown;
					fixedPoint?: unknown;
				};
				const elementId = b.elementId;
				if (typeof elementId === "string" && elementId.trim()) {
					const sanitizedBinding: Record<string, unknown> = {
						elementId: elementId.trim(),
					};
					// Preserve fixedPoint for arrow snap positions
					if (
						Array.isArray(b.fixedPoint) &&
						b.fixedPoint.length === 2 &&
						typeof b.fixedPoint[0] === "number" &&
						typeof b.fixedPoint[1] === "number"
					) {
						sanitizedBinding.fixedPoint = [b.fixedPoint[0], b.fixedPoint[1]];
					}
					candidate[bindingKey] = sanitizedBinding;
				}
			}
		}
		sanitized.push(candidate);
	}
	return sanitized;
}

function hasLabel(element: Record<string, unknown>): boolean {
	if (typeof element.text === "string" && element.text.trim().length > 0)
		return true;
	const label = element.label as { text?: unknown } | undefined;
	return !!(
		label &&
		typeof label.text === "string" &&
		label.text.trim().length > 0
	);
}

export function validateGeneratedElements(
	elements: Array<Record<string, unknown>>,
	mode: WhiteboardGenerationMode,
): { valid: boolean; issues: string[] } {
	const shapes = elements.filter((el) =>
		SHAPE_TYPES.has(String(el.type ?? "")),
	);
	const connectors = elements.filter((el) =>
		CONNECTOR_TYPES.has(String(el.type ?? "")),
	);
	const labeledShapes = shapes.filter(hasLabel);
	const criticalIssues: string[] = [];
	const advisoryIssues: string[] = [];

	if (shapes.length === 0) {
		criticalIssues.push("Diagram must include at least one shape.");
	}

	if (mode === "wireframe") {
		const wideBlocks = shapes.filter((el) => Number(el.width ?? 0) >= 220);
		if (wideBlocks.length < 1) {
			advisoryIssues.push(
				"Wireframe should include at least one panel-sized block.",
			);
		}
	}

	if (mode === "flowchart" && shapes.length >= 2 && connectors.length === 0) {
		advisoryIssues.push("Flowchart should include connectors between steps.");
	}

	if (
		mode === "architecture" &&
		shapes.length >= 2 &&
		connectors.length === 0
	) {
		advisoryIssues.push(
			"Architecture diagrams should include explicit relationships.",
		);
	}

	if (shapes.length > 0 && labeledShapes.length === 0) {
		advisoryIssues.push("Add labels to improve readability.");
	}

	return {
		valid: criticalIssues.length === 0,
		issues: [...criticalIssues, ...advisoryIssues],
	};
}

export function inferGenerationMode(prompt: string): WhiteboardGenerationMode {
	const normalized = prompt.toLowerCase();
	if (
		/\b(ui|wireframe|screen|page|dashboard|todo|form|layout|mobile app|web app)\b/.test(
			normalized,
		)
	) {
		return "wireframe";
	}
	if (
		/\b(architecture|service|microservice|system design|infrastructure|api|database)\b/.test(
			normalized,
		)
	) {
		return "architecture";
	}
	return "flowchart";
}

export function fallbackElementsForMode(
	mode: WhiteboardGenerationMode,
): Array<Record<string, unknown>> {
	if (mode === "wireframe") {
		return [
			{
				type: "rectangle",
				id: "wf-shell",
				x: 80,
				y: 80,
				width: 920,
				height: 580,
				label: { text: "App shell", fontSize: 20 },
				backgroundColor: "#f4f4f5",
			},
			{
				type: "rectangle",
				id: "wf-header",
				x: 120,
				y: 120,
				width: 840,
				height: 72,
				label: { text: "Header", fontSize: 16 },
				backgroundColor: "#e4e4e7",
			},
			{
				type: "rectangle",
				id: "wf-sidebar",
				x: 120,
				y: 220,
				width: 220,
				height: 390,
				label: { text: "Sidebar", fontSize: 16 },
				backgroundColor: "#e4e4e7",
			},
			{
				type: "rectangle",
				id: "wf-main",
				x: 370,
				y: 220,
				width: 590,
				height: 390,
				label: { text: "Main content", fontSize: 16 },
				backgroundColor: "#e4e4e7",
			},
			{
				type: "rectangle",
				id: "wf-card-1",
				x: 410,
				y: 270,
				width: 250,
				height: 130,
				label: { text: "Primary panel", fontSize: 14 },
				backgroundColor: "#dbeafe",
			},
			{
				type: "rectangle",
				id: "wf-card-2",
				x: 690,
				y: 270,
				width: 230,
				height: 130,
				label: { text: "Secondary panel", fontSize: 14 },
				backgroundColor: "#dcfce7",
			},
			{
				type: "rectangle",
				id: "wf-list",
				x: 410,
				y: 430,
				width: 510,
				height: 130,
				label: { text: "Task list / table", fontSize: 14 },
				backgroundColor: "#fef3c7",
			},
		];
	}

	if (mode === "architecture") {
		return [
			{
				type: "rectangle",
				id: "arch-user",
				x: 80,
				y: 280,
				width: 180,
				height: 80,
				label: { text: "User", fontSize: 16 },
				backgroundColor: "#dbeafe",
			},
			{
				type: "rectangle",
				id: "arch-web",
				x: 340,
				y: 280,
				width: 220,
				height: 80,
				label: { text: "Web app", fontSize: 16 },
				backgroundColor: "#dcfce7",
			},
			{
				type: "rectangle",
				id: "arch-api",
				x: 650,
				y: 280,
				width: 220,
				height: 80,
				label: { text: "API service", fontSize: 16 },
				backgroundColor: "#fee2e2",
			},
			{
				type: "rectangle",
				id: "arch-db",
				x: 980,
				y: 220,
				width: 220,
				height: 80,
				label: { text: "Database", fontSize: 16 },
				backgroundColor: "#fef3c7",
			},
			{
				type: "rectangle",
				id: "arch-cache",
				x: 980,
				y: 360,
				width: 220,
				height: 80,
				label: { text: "Cache", fontSize: 16 },
				backgroundColor: "#ede9fe",
			},
			{
				type: "arrow",
				id: "arch-a1",
				x: 260,
				y: 320,
				width: 80,
				height: 0,
				startBinding: { elementId: "arch-user" },
				endBinding: { elementId: "arch-web" },
				endArrowhead: "arrow",
			},
			{
				type: "arrow",
				id: "arch-a2",
				x: 560,
				y: 320,
				width: 90,
				height: 0,
				startBinding: { elementId: "arch-web" },
				endBinding: { elementId: "arch-api" },
				endArrowhead: "arrow",
			},
			{
				type: "arrow",
				id: "arch-a3",
				x: 870,
				y: 300,
				width: 110,
				height: -40,
				startBinding: { elementId: "arch-api" },
				endBinding: { elementId: "arch-db" },
				endArrowhead: "arrow",
			},
			{
				type: "arrow",
				id: "arch-a4",
				x: 870,
				y: 340,
				width: 110,
				height: 40,
				startBinding: { elementId: "arch-api" },
				endBinding: { elementId: "arch-cache" },
				endArrowhead: "arrow",
			},
		];
	}

	return [
		{
			type: "ellipse",
			id: "flow-start",
			x: 120,
			y: 120,
			width: 180,
			height: 72,
			label: { text: "Start", fontSize: 16 },
			backgroundColor: "#dbeafe",
		},
		{
			type: "rectangle",
			id: "flow-step-1",
			x: 120,
			y: 270,
			width: 220,
			height: 84,
			label: { text: "Step 1", fontSize: 16 },
			backgroundColor: "#dcfce7",
		},
		{
			type: "diamond",
			id: "flow-check",
			x: 160,
			y: 430,
			width: 150,
			height: 110,
			label: { text: "Decision", fontSize: 14 },
			backgroundColor: "#fef3c7",
		},
		{
			type: "rectangle",
			id: "flow-step-2",
			x: 460,
			y: 430,
			width: 220,
			height: 84,
			label: { text: "Step 2", fontSize: 16 },
			backgroundColor: "#ede9fe",
		},
		{
			type: "ellipse",
			id: "flow-end",
			x: 460,
			y: 590,
			width: 180,
			height: 72,
			label: { text: "End", fontSize: 16 },
			backgroundColor: "#fee2e2",
		},
		{
			type: "arrow",
			id: "flow-a1",
			x: 210,
			y: 192,
			width: 0,
			height: 78,
			startBinding: { elementId: "flow-start" },
			endBinding: { elementId: "flow-step-1" },
			endArrowhead: "arrow",
		},
		{
			type: "arrow",
			id: "flow-a2",
			x: 230,
			y: 354,
			width: 0,
			height: 76,
			startBinding: { elementId: "flow-step-1" },
			endBinding: { elementId: "flow-check" },
			endArrowhead: "arrow",
		},
		{
			type: "arrow",
			id: "flow-a3",
			x: 320,
			y: 485,
			width: 140,
			height: 0,
			startBinding: { elementId: "flow-check" },
			endBinding: { elementId: "flow-step-2" },
			endArrowhead: "arrow",
		},
		{
			type: "arrow",
			id: "flow-a4",
			x: 550,
			y: 514,
			width: 0,
			height: 76,
			startBinding: { elementId: "flow-step-2" },
			endBinding: { elementId: "flow-end" },
			endArrowhead: "arrow",
		},
	];
}
