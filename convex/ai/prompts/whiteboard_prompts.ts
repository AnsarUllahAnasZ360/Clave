/**
 * System prompts for whiteboard AI operations.
 * Pure functions — no runtime dependencies.
 *
 * The EXCALIDRAW_ELEMENT_REFERENCE is vendored from the official Excalidraw MCP
 * server's RECALL_CHEAT_SHEET (https://github.com/excalidraw/excalidraw-mcp).
 * We embed it directly so the AI generation path has zero MCP dependency and
 * zero network latency for reference material.
 */

// ── Vendored Excalidraw element format reference ─────────────────────────
// Stripped from official RECALL_CHEAT_SHEET: removed camera/viewport,
// checkpoint/restore, animation, delete pseudo-elements, sequence diagram
// example. Kept: colors, element types, labels, arrows, bindings, sizing.

const EXCALIDRAW_ELEMENT_REFERENCE = `## Color Palette

### Pastel Fills (for shape backgrounds)
| Color | Hex | Good For |
|-------|-----|----------|
| Light Blue | #a5d8ff | Input, sources, primary nodes |
| Light Green | #b2f2bb | Success, output, completed |
| Light Orange | #ffd8a8 | Warning, pending, external |
| Light Purple | #d0bfff | Processing, middleware, special |
| Light Red | #ffc9c9 | Error, critical, alerts |
| Light Yellow | #fff3bf | Notes, decisions, planning |
| Light Teal | #c3fae8 | Storage, data, memory |
| Light Pink | #eebefa | Analytics, metrics |

### Background Zones (use with opacity: 30 for layered diagrams)
| Color | Hex | Good For |
|-------|-----|----------|
| Blue zone | #dbe4ff | UI / frontend layer |
| Purple zone | #e5dbff | Logic / agent layer |
| Green zone | #d3f9d8 | Data / tool layer |

## Excalidraw Elements

### Required Fields (all elements)
type, id (unique string), x, y, width, height

### Defaults (skip these)
strokeColor="#1e1e1e", backgroundColor="transparent", fillStyle="solid", strokeWidth=2, roughness=1, opacity=100

### Element Types

Rectangle: { "type": "rectangle", "id": "r1", "x": 100, "y": 100, "width": 200, "height": 100 }
- roundness: { type: 3 } for rounded corners
- backgroundColor: "#a5d8ff", fillStyle: "solid" for filled

Ellipse: { "type": "ellipse", "id": "e1", "x": 100, "y": 100, "width": 150, "height": 150 }

Diamond: { "type": "diamond", "id": "d1", "x": 100, "y": 100, "width": 150, "height": 150 }

Labeled shape (PREFERRED): Add label to any shape for auto-centered text. No separate text element needed.
{ "type": "rectangle", "id": "r1", "x": 100, "y": 100, "width": 200, "height": 80, "label": { "text": "Hello", "fontSize": 20 } }
- Works on rectangle, ellipse, diamond
- Text auto-centers and container auto-resizes to fit

Labeled arrow: "label": { "text": "connects" } on an arrow element.

Standalone text (titles, annotations only):
{ "type": "text", "id": "t1", "x": 150, "y": 138, "text": "Hello", "fontSize": 20 }

Arrow: { "type": "arrow", "id": "a1", "x": 300, "y": 150, "width": 200, "height": 0, "points": [[0,0],[200,0]], "endArrowhead": "arrow" }
- points: [dx, dy] offsets from element x,y
- endArrowhead: null | "arrow" | "bar" | "dot" | "triangle"

### Arrow Bindings
startBinding: { "elementId": "r1", "fixedPoint": [1, 0.5] }
endBinding: { "elementId": "r2", "fixedPoint": [0, 0.5] }
fixedPoint: top=[0.5,0], bottom=[0.5,1], left=[0,0.5], right=[1,0.5]

### Sizing Rules
- Minimum fontSize: 16 for body text/labels, 20 for titles
- Minimum shape size: 120x60 for labeled rectangles/ellipses
- Leave 20-30px gaps between elements minimum
- Prefer fewer, larger elements over many tiny ones

### Example: Two connected labeled boxes
[
  { "type": "rectangle", "id": "b1", "x": 100, "y": 100, "width": 200, "height": 100, "roundness": { "type": 3 }, "backgroundColor": "#a5d8ff", "fillStyle": "solid", "label": { "text": "Start", "fontSize": 20 } },
  { "type": "rectangle", "id": "b2", "x": 450, "y": 100, "width": 200, "height": 100, "roundness": { "type": 3 }, "backgroundColor": "#b2f2bb", "fillStyle": "solid", "label": { "text": "End", "fontSize": 20 } },
  { "type": "arrow", "id": "a1", "x": 300, "y": 150, "width": 150, "height": 0, "points": [[0,0],[150,0]], "endArrowhead": "arrow", "startBinding": { "elementId": "b1", "fixedPoint": [1, 0.5] }, "endBinding": { "elementId": "b2", "fixedPoint": [0, 0.5] } }
]`;

export function whiteboardGenerateDiagramPrompt(context: {
	title: string;
	prompt: string;
	existingElements?: string;
	mode: "wireframe" | "flowchart" | "architecture";
	generation?: {
		appType?: string;
		coreSections?: string;
		keyActions?: string;
		density?: "compact" | "balanced" | "detailed";
	};
}): string {
	const existingBlock = context.existingElements
		? `\nExisting elements on the canvas (JSON): ${context.existingElements}`
		: "";
	const generationBlock = context.generation
		? `\nGeneration options:\n${JSON.stringify(context.generation)}`
		: "";
	const modeInstructions =
		context.mode === "wireframe"
			? `Design a practical product wireframe. Prefer large UI containers (header/sidebar/content/cards), clear labels, and realistic section grouping. Avoid tiny decorative nodes.`
			: context.mode === "architecture"
				? `Design a system architecture diagram with services/components and explicit data/control flow connectors.`
				: `Design a flowchart with explicit ordered steps and directional connectors.`;

	return `You are a diagram generation assistant for an Excalidraw whiteboard. Generate drawable elements based on the user's request.

Whiteboard: ${context.title}${existingBlock}
Generation mode: ${context.mode}${generationBlock}

User request:
${context.prompt}

Mode behavior:
${modeInstructions}

${EXCALIDRAW_ELEMENT_REFERENCE}

Return ONLY a JSON object with an "elements" array. No markdown fences. No commentary.

Element types you may use: rectangle, ellipse, diamond, text, arrow, line.
Do NOT use pseudo-elements (cameraUpdate, restoreCheckpoint, delete).

Rules:
- Use 200px spacing between shapes. Minimum shape size: 150x70.
- Generate unique IDs for all shapes so arrows can reference them.
- Every arrow must have startBinding and endBinding referencing shape IDs.
- For wireframes: use large containers (300+ width), nested panels, realistic labels.
- Use backgroundColor with fillStyle: "solid" on shapes for color.
- Use roundness: { type: 3 } on rectangles for rounded corners.
- Return valid JSON only.`;
}

export function whiteboardExplainDiagramPrompt(context: {
	title: string;
	elements: string;
	scope?: "selection" | "canvas";
}): string {
	return `You are a diagram analysis assistant. Describe what this whiteboard diagram represents.

Whiteboard: ${context.title}
Scope: ${context.scope ?? "canvas"}
Elements (JSON): ${context.elements}

Return a concise structured explanation with these sections:
1) Purpose
2) Flow and relationships
3) Missing links or ambiguities
4) Suggested improvements

Keep it plain text and practical (4 short paragraphs max).`;
}

export function whiteboardCleanupLayoutPrompt(context: {
	title: string;
	elements: string;
}): string {
	return `You are a layout assistant for a whiteboard. Reorganize the following elements into a cleaner layout while preserving relationships.

Whiteboard: ${context.title}
Input (may include scope and instructions): ${context.elements}

Respond with a JSON object (no markdown code fences) containing the repositioned elements:
{
  "elements": [
    { "id": "existing-id", "x": newX, "y": newY }
  ]
}

Rules:
- Only include IDs that already exist in the input.
- Only include elements that should move.
- Do not add or remove elements.
- Keep spacing consistent and avoid overlaps.
- Return valid JSON only.`;
}
