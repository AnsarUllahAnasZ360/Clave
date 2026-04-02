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

// ── Mode-specific generation instructions ───────────────────────────────

const WIREFRAME_INSTRUCTIONS = `## Wireframe mode
Design a realistic product wireframe that looks like an actual UI layout. Think like a UX designer.

### Layout strategy:
1. Start with a FULL-WIDTH container rectangle (width: 900-1200, height: 700-900) as the page frame. Use backgroundColor: "#f5f5f5", fillStyle: "solid".
2. Add a HEADER bar at the top (full width, height: 60-80). Use backgroundColor: "#1e1e1e" with label fontSize: 20 in white.
3. Add a SIDEBAR if applicable (width: 220-260, full remaining height). Use backgroundColor: "#e8e8e8".
4. Add a CONTENT AREA filling the remaining space.
5. Inside content: add CARDS (width: 280-350, height: 180-220), FORM FIELDS (width: 300-400, height: 44), BUTTONS (width: 120-160, height: 44), TABLES (width: 600+).
6. Group related elements visually — use consistent spacing (20px gaps within sections, 40px between sections).

### Sizing rules for wireframes:
- Page frame: 900-1200 x 700-900
- Header: full width x 60-80
- Sidebar: 220-260 x full height
- Cards: 280-350 x 180-220
- Buttons: 120-160 x 44
- Input fields: 300-400 x 44
- List items: full container width x 48-56
- Minimum 20px padding inside containers

### Color usage for wireframes:
- Page background: "#f5f5f5" (light gray)
- Header/dark sections: "#1e1e1e" or "#343a40"
- Sidebar/secondary: "#e8e8e8"
- Cards/panels: "#ffffff" (white)
- Primary buttons: "#a5d8ff" (blue)
- Secondary buttons: "#e8e8e8" (gray)
- Accent/CTA: "#ffd8a8" (orange)

### Labels for wireframes:
- Use realistic text: "Dashboard", "Search...", "Create New", "Settings", "Profile", "Recent Activity", not generic "Label 1"
- Button labels should be verb-first: "Save Changes", "Add Item", "Export Data"
- Use placeholder text for content areas: "Page Title", "Description text here..."`;

const FLOWCHART_INSTRUCTIONS = `## Flowchart mode
Design a clear, readable flowchart with explicit directional flow.

### Layout strategy:
1. Use TOP-TO-BOTTOM or LEFT-TO-RIGHT flow (pick one, be consistent).
2. Start with a rounded rectangle for START, end with one for END.
3. Use diamonds for DECISIONS (yes/no branches).
4. Use rectangles for PROCESS steps.
5. Use ellipses for START/END terminators.
6. Space nodes 200-250px apart vertically, 300px horizontally for branches.
7. Keep decision branches visually separated — "Yes" goes right or down, "No" goes the other direction.

### Sizing rules for flowcharts:
- Process rectangles: 200-280 x 80-100
- Decision diamonds: 160-200 x 160-200
- Start/End ellipses: 160 x 80
- Spacing: 200-250px vertical, 300px horizontal for branches
- Arrow labels for decision outcomes: "Yes", "No", "True", "False"

### Color usage for flowcharts:
- Start/End: "#b2f2bb" (green)
- Process steps: "#a5d8ff" (blue)
- Decisions: "#fff3bf" (yellow)
- Error/exception paths: "#ffc9c9" (red)
- Sub-processes: "#d0bfff" (purple)

### Arrow rules:
- Every connection MUST use arrow elements with startBinding and endBinding.
- Decision arrows MUST have labels: { "text": "Yes" } or { "text": "No" }.
- Use fixedPoint for clean connections: right=[1,0.5], left=[0,0.5], top=[0.5,0], bottom=[0.5,1].`;

const ARCHITECTURE_INSTRUCTIONS = `## Architecture diagram mode
Design a system architecture diagram showing components, services, and data flow.

### Layout strategy:
1. Use LAYERED layout: UI layer at top, API/logic in middle, data/storage at bottom.
2. Group related services in zone rectangles (large, semi-transparent background boxes).
3. Show data flow with labeled arrows between components.
4. External services go on the edges (left/right sides).

### Sizing rules for architecture:
- Zone/layer rectangles: 500-800 x 200-300 with opacity: 30
- Service/component boxes: 180-250 x 80-100
- Database cylinders (use ellipse): 140 x 100
- Spacing: 60px within zones, 100px between zones
- Layer labels as standalone text with fontSize: 24

### Color usage for architecture:
- Frontend/UI layer zone: "#dbe4ff" (blue zone)
- API/Logic layer zone: "#e5dbff" (purple zone)
- Data/Storage layer zone: "#d3f9d8" (green zone)
- Services: "#a5d8ff" (blue)
- Databases: "#c3fae8" (teal)
- External APIs: "#ffd8a8" (orange)
- Message queues/events: "#d0bfff" (purple)
- Cache/CDN: "#fff3bf" (yellow)

### Arrow rules:
- Use labeled arrows for data flow: "REST API", "GraphQL", "WebSocket", "SQL", "Pub/Sub"
- Arrows between layers should be vertical (top-to-bottom)
- Arrows within layers should be horizontal`;

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
			? WIREFRAME_INSTRUCTIONS
			: context.mode === "architecture"
				? ARCHITECTURE_INSTRUCTIONS
				: FLOWCHART_INSTRUCTIONS;

	return `You are a diagram generation assistant for an Excalidraw whiteboard. Generate drawable elements based on the user's request.

Whiteboard: ${context.title}${existingBlock}
Generation mode: ${context.mode}${generationBlock}

User request:
${context.prompt}

${modeInstructions}

${EXCALIDRAW_ELEMENT_REFERENCE}

Return ONLY a JSON object with an "elements" array. No markdown fences. No commentary.

Element types you may use: rectangle, ellipse, diamond, text, arrow, line.
Do NOT use pseudo-elements (cameraUpdate, restoreCheckpoint, delete).

## Critical rules (apply to ALL modes):
- Generate unique string IDs for every element (e.g. "header-1", "nav-2", "arrow-3").
- Every shape MUST have a "label" property with "text" and "fontSize". Shapes without labels are useless.
- Use fontSize 16 minimum for body text, 20 for titles, 24 for section headers.
- Use backgroundColor with fillStyle: "solid" on shapes for color.
- Use roundness: { type: 3 } on rectangles for rounded corners.
- Every arrow must have startBinding and endBinding referencing shape IDs with fixedPoint.
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
