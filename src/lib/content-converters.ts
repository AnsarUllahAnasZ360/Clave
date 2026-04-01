/**
 * Content format converters for the Plate.js migration.
 *
 * Supports three source formats → Slate JSON (Plate's format):
 * - ProseMirror JSON (collaborative document storage via prosemirror-sync)
 * - BlockNote Block JSON (simple editor storage: issues, projects)
 * - Plain text (legacy fallback)
 *
 * Used at read-time only — existing documents keep their format in the database.
 */

// ---------------------------------------------------------------------------
// ProseMirror JSON types (BlockNote's PM schema)
// ---------------------------------------------------------------------------

type PmMark = { type: string; attrs?: Record<string, unknown> };

type PmNode = {
	type: string;
	content?: PmNode[];
	attrs?: Record<string, unknown>;
	text?: string;
	marks?: PmMark[];
};

// biome-ignore lint/suspicious/noExplicitAny: Slate nodes use flexible shapes
type SlateNode = Record<string, any>;

// ---------------------------------------------------------------------------
// ProseMirror JSON → Slate JSON converter
// ---------------------------------------------------------------------------

/**
 * Convert a ProseMirror JSON document (from BlockNote/prosemirror-sync) to
 * Slate JSON for Plate.js rendering.
 *
 * Returns `[{ type: 'p', children: [{ text: '' }] }]` for empty/invalid input.
 */
export function prosemirrorToSlate(
	pmJson: Record<string, unknown>,
): SlateNode[] {
	const EMPTY_DOC: SlateNode[] = [{ type: "p", children: [{ text: "" }] }];

	if (!pmJson || typeof pmJson !== "object") return EMPTY_DOC;

	const doc = pmJson as PmNode;

	if (doc.type !== "doc" || !doc.content) return EMPTY_DOC;

	const result: SlateNode[] = [];
	collectBlocks(doc.content, result, 0);

	return result.length > 0 ? result : EMPTY_DOC;
}

// ---------------------------------------------------------------------------
// Block collection — walks container nodes and collects block-level elements
// ---------------------------------------------------------------------------

/**
 * Recursively walk PM content nodes, unwrapping BlockNote wrapper nodes
 * (blockGroup, blockContainer) and converting block-level nodes to Slate.
 *
 * @param depth - nesting depth for list indent levels (0 = top-level)
 */
function collectBlocks(
	nodes: PmNode[],
	output: SlateNode[],
	depth: number,
): void {
	for (const node of nodes) {
		switch (node.type) {
			// BlockNote wrapper nodes — unwrap and recurse
			case "doc":
			case "blockGroup":
				if (node.content) {
					collectBlocks(node.content, output, depth);
				}
				break;

			case "blockContainer": {
				// blockContainer has 1+ children:
				//  - First child is the block (paragraph, heading, list item, etc.)
				//  - Optional second child is a blockGroup with nested sub-blocks
				if (!node.content) break;

				for (let i = 0; i < node.content.length; i++) {
					const child = node.content[i];
					if (child.type === "blockGroup") {
						// Nested sub-blocks: increase depth for list indent
						collectBlocks(child.content ?? [], output, depth + 1);
					} else {
						// The actual block content
						convertBlock(child, output, depth, node.attrs);
					}
				}
				break;
			}

			// Direct block-level nodes
			default:
				convertBlock(node, output, depth);
				break;
		}
	}
}

// ---------------------------------------------------------------------------
// Block conversion — maps PM block types to Slate elements
// ---------------------------------------------------------------------------

/**
 * Convert a single PM block node to a Slate element and push it to output.
 *
 * @param containerAttrs - attrs from the parent blockContainer (id, textColor, etc.)
 */
function convertBlock(
	node: PmNode,
	output: SlateNode[],
	depth: number,
	containerAttrs?: Record<string, unknown>,
): void {
	const textAlign = resolveTextAlign(
		node.attrs?.textAlignment ?? containerAttrs?.textAlignment,
	);
	const nodeId = containerAttrs?.id ?? node.attrs?.id;

	switch (node.type) {
		case "paragraph": {
			const el: SlateNode = {
				type: "p",
				children: convertInline(node.content),
			};
			if (textAlign) el.textAlign = textAlign;
			if (nodeId) el.id = nodeId;
			applyBlockColors(el, containerAttrs);
			output.push(el);
			break;
		}

		case "heading": {
			const level = Math.min(Math.max(Number(node.attrs?.level) || 1, 1), 6);
			const el: SlateNode = {
				type: `h${level}`,
				children: convertInline(node.content),
			};
			if (textAlign) el.textAlign = textAlign;
			if (nodeId) el.id = nodeId;
			applyBlockColors(el, containerAttrs);
			output.push(el);
			break;
		}

		case "bulletListItem": {
			const indent = Math.max(depth, 1);
			const el: SlateNode = {
				type: "p",
				indent,
				listStyleType: "disc",
				children: convertInline(node.content),
			};
			if (textAlign) el.textAlign = textAlign;
			if (nodeId) el.id = nodeId;
			applyBlockColors(el, containerAttrs);
			output.push(el);
			break;
		}

		case "numberedListItem": {
			const indent = Math.max(depth, 1);
			const el: SlateNode = {
				type: "p",
				indent,
				listStyleType: "decimal",
				children: convertInline(node.content),
			};
			if (textAlign) el.textAlign = textAlign;
			if (nodeId) el.id = nodeId;
			applyBlockColors(el, containerAttrs);
			output.push(el);
			break;
		}

		case "checkListItem": {
			const indent = Math.max(depth, 1);
			const el: SlateNode = {
				type: "p",
				indent,
				listStyleType: "todo",
				checked: Boolean(node.attrs?.checked),
				children: convertInline(node.content),
			};
			if (textAlign) el.textAlign = textAlign;
			if (nodeId) el.id = nodeId;
			applyBlockColors(el, containerAttrs);
			output.push(el);
			break;
		}

		case "codeBlock": {
			const el: SlateNode = {
				type: "code_block",
				lang: String(node.attrs?.language ?? ""),
				children: convertCodeLines(node.content),
			};
			if (nodeId) el.id = nodeId;
			output.push(el);
			break;
		}

		case "blockquote": {
			// BlockNote blockquote may have inline children or nested blocks
			if (
				node.content?.some((c) =>
					["blockGroup", "blockContainer", "paragraph"].includes(c.type),
				)
			) {
				// Nested block content — collect inner blocks
				const innerBlocks: SlateNode[] = [];
				collectBlocks(node.content, innerBlocks, depth);
				for (const inner of innerBlocks) {
					output.push({ type: "blockquote", children: [inner] });
				}
			} else {
				const el: SlateNode = {
					type: "blockquote",
					children: [{ type: "p", children: convertInline(node.content) }],
				};
				if (nodeId) el.id = nodeId;
				output.push(el);
			}
			break;
		}

		case "horizontalRule": {
			output.push({
				type: "hr",
				children: [{ text: "" }],
			});
			break;
		}

		case "image": {
			const el: SlateNode = {
				type: "img",
				url: String(node.attrs?.url ?? "") || String(node.attrs?.src ?? ""),
				children: [{ text: "" }],
			};
			if (node.attrs?.caption) el.caption = String(node.attrs.caption);
			if (node.attrs?.width) el.width = node.attrs.width;
			if (nodeId) el.id = nodeId;
			output.push(el);
			break;
		}

		case "video": {
			const el: SlateNode = {
				type: "video",
				url: String(node.attrs?.url ?? "") || String(node.attrs?.src ?? ""),
				children: [{ text: "" }],
			};
			if (node.attrs?.caption) el.caption = String(node.attrs.caption);
			if (node.attrs?.width) el.width = node.attrs.width;
			if (nodeId) el.id = nodeId;
			output.push(el);
			break;
		}

		case "table": {
			output.push(convertTable(node, nodeId));
			break;
		}

		default: {
			// Unknown block types: convert as paragraph to preserve text content
			if (node.content && node.content.length > 0) {
				const hasBlockChildren = node.content.some((c) =>
					[
						"blockGroup",
						"blockContainer",
						"paragraph",
						"heading",
						"codeBlock",
						"blockquote",
						"table",
					].includes(c.type),
				);
				if (hasBlockChildren) {
					collectBlocks(node.content, output, depth);
				} else {
					output.push({
						type: "p",
						children: convertInline(node.content),
					});
				}
			} else {
				output.push({ type: "p", children: [{ text: "" }] });
			}
			break;
		}
	}
}

// ---------------------------------------------------------------------------
// Inline content conversion — text nodes + marks
// ---------------------------------------------------------------------------

/**
 * Convert PM inline content (text nodes + marks) to Slate text/inline nodes.
 */
function convertInline(content?: PmNode[]): SlateNode[] {
	if (!content || content.length === 0) return [{ text: "" }];

	const result: SlateNode[] = [];

	for (const node of content) {
		if (node.type === "text") {
			const textNode: SlateNode = { text: node.text ?? "" };
			let linkMark: PmMark | undefined;

			if (node.marks) {
				for (const mark of node.marks) {
					switch (mark.type) {
						case "bold":
							textNode.bold = true;
							break;
						case "italic":
							textNode.italic = true;
							break;
						case "underline":
							textNode.underline = true;
							break;
						case "strike":
							textNode.strikethrough = true;
							break;
						case "code":
							textNode.code = true;
							break;
						case "highlight":
							textNode.highlight = true;
							break;
						case "superscript":
							textNode.superscript = true;
							break;
						case "subscript":
							textNode.subscript = true;
							break;
						case "kbd":
							textNode.kbd = true;
							break;
						case "textColor":
							if (mark.attrs?.color && mark.attrs.color !== "default") {
								textNode.color = mark.attrs.color;
							}
							break;
						case "backgroundColor":
							if (mark.attrs?.color && mark.attrs.color !== "default") {
								textNode.backgroundColor = mark.attrs.color;
							}
							break;
						case "link":
							linkMark = mark;
							break;
						case "comment": {
							// Plate comment marks use `comment_${threadId}: true`
							const threadId = mark.attrs?.id ?? mark.attrs?.threadId;
							if (threadId) {
								textNode[`comment_${threadId}`] = true;
							}
							break;
						}
						default:
							// Skip unknown marks gracefully
							break;
					}
				}
			}

			// Wrap in link element if a link mark is present
			if (linkMark) {
				const linkEl: SlateNode = {
					type: "a",
					url: String(linkMark.attrs?.href ?? ""),
					children: [textNode],
				};
				if (linkMark.attrs?.target) {
					linkEl.target = String(linkMark.attrs.target);
				}
				result.push(linkEl);
			} else {
				result.push(textNode);
			}
		} else if (node.type === "hardBreak") {
			result.push({ text: "\n" });
		} else if (node.type === "mention") {
			// Inline mention node
			result.push({
				type: "mention",
				value: String(node.attrs?.name ?? node.attrs?.id ?? ""),
				userId: node.attrs?.userId,
				children: [{ text: "" }],
			});
		} else if (node.type === "image") {
			// Inline image
			result.push({
				type: "img",
				url: String(node.attrs?.url ?? "") || String(node.attrs?.src ?? ""),
				children: [{ text: "" }],
			});
		} else {
			// Unknown inline node — extract text if available
			result.push({ text: node.text ?? "" });
		}
	}

	return result.length > 0 ? result : [{ text: "" }];
}

// ---------------------------------------------------------------------------
// Code block helper
// ---------------------------------------------------------------------------

/**
 * Convert code block content to code_line elements.
 * PM code blocks store text directly as text nodes.
 */
function convertCodeLines(content?: PmNode[]): SlateNode[] {
	if (!content) return [{ type: "code_line", children: [{ text: "" }] }];

	const text = content.map((n) => n.text ?? "").join("");
	const lines = text.split("\n");

	return lines.map((line) => ({
		type: "code_line",
		children: [{ text: line }],
	}));
}

// ---------------------------------------------------------------------------
// Table helper
// ---------------------------------------------------------------------------

/**
 * Convert a PM table node to Slate table structure.
 * Handles both tableHeader (th) and tableCell (td) types.
 */
function convertTable(node: PmNode, nodeId?: unknown): SlateNode {
	const table: SlateNode = {
		type: "table",
		children: (node.content ?? []).map((row) => ({
			type: "tr",
			children: (row.content ?? []).map((cell) => {
				const cellNode: SlateNode = {
					type: cell.type === "tableHeader" ? "th" : "td",
					children: convertTableCellContent(cell.content),
				};
				// Preserve cell attrs (colspan, rowspan, colwidth)
				if (cell.attrs?.colspan && cell.attrs.colspan !== 1) {
					cellNode.colSpan = cell.attrs.colspan;
				}
				if (cell.attrs?.rowspan && cell.attrs.rowspan !== 1) {
					cellNode.rowSpan = cell.attrs.rowspan;
				}
				return cellNode;
			}),
		})),
	};
	if (nodeId) table.id = nodeId;
	return table;
}

/**
 * Convert table cell content. Cells may contain block-level content
 * (paragraphs, etc.) or inline content.
 */
function convertTableCellContent(content?: PmNode[]): SlateNode[] {
	if (!content || content.length === 0) {
		return [{ type: "p", children: [{ text: "" }] }];
	}

	// Check if content has block-level nodes
	const hasBlocks = content.some(
		(c) =>
			c.type === "paragraph" ||
			c.type === "heading" ||
			c.type === "bulletListItem" ||
			c.type === "numberedListItem" ||
			c.type === "blockGroup" ||
			c.type === "blockContainer",
	);

	if (hasBlocks) {
		const blocks: SlateNode[] = [];
		collectBlocks(content, blocks, 0);
		return blocks.length > 0
			? blocks
			: [{ type: "p", children: [{ text: "" }] }];
	}

	// Inline content: wrap in paragraph
	return [{ type: "p", children: convertInline(content) }];
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/**
 * Map PM textAlignment attr to Slate textAlign value.
 * Returns undefined for "left" (default) to avoid unnecessary props.
 */
function resolveTextAlign(alignment: unknown): string | undefined {
	if (!alignment || alignment === "left") return undefined;
	const val = String(alignment);
	if (["center", "right", "justify"].includes(val)) return val;
	return undefined;
}

/**
 * Apply block-level text/background colors from BlockNote container attrs
 * to a Slate element node.
 */
function applyBlockColors(
	el: SlateNode,
	containerAttrs?: Record<string, unknown>,
): void {
	if (!containerAttrs) return;

	if (containerAttrs.textColor && containerAttrs.textColor !== "default") {
		el.color = containerAttrs.textColor;
	}
	if (
		containerAttrs.backgroundColor &&
		containerAttrs.backgroundColor !== "default"
	) {
		el.backgroundColor = containerAttrs.backgroundColor;
	}
}

// ---------------------------------------------------------------------------
// Content format detection utility
// ---------------------------------------------------------------------------

/**
 * Detect the format of a content string.
 * Returns the format type for choosing the appropriate converter.
 *
 * Note: TipTap JSON is structurally identical to ProseMirror JSON
 * (`{ type: "doc", content: [...] }`), so it returns "prosemirror".
 */
export function detectContentFormat(
	content: string,
): "slate" | "prosemirror" | "blocknote" | "markdown" | "plain" {
	try {
		const parsed = JSON.parse(content);

		if (Array.isArray(parsed) && parsed.length > 0) {
			const first = parsed[0];
			// BlockNote JSON has `props` and `content` keys
			if (first.props !== undefined && first.content !== undefined) {
				return "blocknote";
			}
			// Slate JSON: array of nodes with `children`
			return "slate";
		}

		// ProseMirror / TipTap JSON: { type: "doc", content: [...] }
		if (parsed?.type === "doc") {
			return "prosemirror";
		}

		return "plain";
	} catch {
		// Not JSON — check if it looks like markdown before falling back to plain
		return looksLikeMarkdown(content) ? "markdown" : "plain";
	}
}

// ---------------------------------------------------------------------------
// BlockNote Block JSON types
// ---------------------------------------------------------------------------

interface BnInlineContent {
	type: string;
	text?: string;
	styles?: Record<string, boolean | string>;
	href?: string;
	content?: BnInlineContent[];
	props?: Record<string, unknown>;
}

interface BnBlock {
	id?: string;
	type: string;
	props?: Record<string, unknown>;
	content?: BnInlineContent[] | string;
	children?: BnBlock[];
}

// ---------------------------------------------------------------------------
// BlockNote Block JSON → Slate JSON converter
// ---------------------------------------------------------------------------

/**
 * Convert an array of BlockNote Block JSON objects to Slate JSON nodes.
 *
 * BlockNote Block JSON is the `editor.document` output format used by
 * the simple editors (issues, projects). It consists of Block
 * objects with `type`, `props`, `content`, and `children` fields.
 *
 * Returns `[{ type: 'p', children: [{ text: '' }] }]` for empty/invalid input.
 */
export function blockNoteToSlate(blocks: unknown[]): SlateNode[] {
	const EMPTY_DOC: SlateNode[] = [{ type: "p", children: [{ text: "" }] }];

	if (!Array.isArray(blocks) || blocks.length === 0) return EMPTY_DOC;

	const result: SlateNode[] = [];
	convertBnBlocks(blocks as BnBlock[], result, 0);

	return result.length > 0 ? result : EMPTY_DOC;
}

/**
 * Recursively convert an array of BlockNote blocks, tracking indent depth
 * for nested children (sub-list items).
 */
function convertBnBlocks(
	blocks: BnBlock[],
	output: SlateNode[],
	depth: number,
): void {
	for (const block of blocks) {
		convertBnBlock(block, output, depth);

		// Recurse into nested children with increased indent depth
		if (block.children && block.children.length > 0) {
			convertBnBlocks(block.children, output, depth + 1);
		}
	}
}

/**
 * Convert a single BlockNote block to a Slate element and push to output.
 */
function convertBnBlock(
	block: BnBlock,
	output: SlateNode[],
	depth: number,
): void {
	const textAlign = resolveTextAlign(block.props?.textAlignment);

	switch (block.type) {
		case "paragraph": {
			const el: SlateNode = {
				type: "p",
				children: convertBnInline(block.content),
			};
			if (textAlign) el.textAlign = textAlign;
			applyBnBlockColors(el, block.props);
			output.push(el);
			break;
		}

		case "heading": {
			const level = Math.min(Math.max(Number(block.props?.level) || 1, 1), 6);
			const el: SlateNode = {
				type: `h${level}`,
				children: convertBnInline(block.content),
			};
			if (textAlign) el.textAlign = textAlign;
			applyBnBlockColors(el, block.props);
			output.push(el);
			break;
		}

		case "bulletListItem": {
			const indent = Math.max(depth + 1, 1);
			const el: SlateNode = {
				type: "p",
				indent,
				listStyleType: "disc",
				children: convertBnInline(block.content),
			};
			if (textAlign) el.textAlign = textAlign;
			applyBnBlockColors(el, block.props);
			output.push(el);
			break;
		}

		case "numberedListItem": {
			const indent = Math.max(depth + 1, 1);
			const el: SlateNode = {
				type: "p",
				indent,
				listStyleType: "decimal",
				children: convertBnInline(block.content),
			};
			if (textAlign) el.textAlign = textAlign;
			applyBnBlockColors(el, block.props);
			output.push(el);
			break;
		}

		case "checkListItem": {
			const indent = Math.max(depth + 1, 1);
			const el: SlateNode = {
				type: "p",
				indent,
				listStyleType: "todo",
				checked: Boolean(block.props?.checked),
				children: convertBnInline(block.content),
			};
			if (textAlign) el.textAlign = textAlign;
			applyBnBlockColors(el, block.props);
			output.push(el);
			break;
		}

		case "codeBlock": {
			const text =
				typeof block.content === "string"
					? block.content
					: Array.isArray(block.content)
						? block.content.map((c) => c.text ?? "").join("")
						: "";
			const lines = text.split("\n");
			output.push({
				type: "code_block",
				lang: String(block.props?.language ?? ""),
				children: lines.map((line) => ({
					type: "code_line",
					children: [{ text: line }],
				})),
			});
			break;
		}

		case "image": {
			const el: SlateNode = {
				type: "img",
				url: String(block.props?.url ?? ""),
				children: [{ text: "" }],
			};
			if (block.props?.caption) el.caption = String(block.props.caption);
			if (block.props?.width) el.width = block.props.width;
			output.push(el);
			break;
		}

		case "video": {
			const el: SlateNode = {
				type: "video",
				url: String(block.props?.url ?? ""),
				children: [{ text: "" }],
			};
			if (block.props?.caption) el.caption = String(block.props.caption);
			if (block.props?.width) el.width = block.props.width;
			output.push(el);
			break;
		}

		case "audio": {
			const el: SlateNode = {
				type: "audio",
				url: String(block.props?.url ?? ""),
				children: [{ text: "" }],
			};
			if (block.props?.caption) el.caption = String(block.props.caption);
			output.push(el);
			break;
		}

		case "file": {
			const el: SlateNode = {
				type: "file",
				url: String(block.props?.url ?? ""),
				children: [{ text: "" }],
			};
			if (block.props?.name) el.name = String(block.props.name);
			output.push(el);
			break;
		}

		case "table": {
			output.push(convertBnTable(block));
			break;
		}

		default: {
			// Unknown block types: convert as paragraph to preserve text content
			const el: SlateNode = {
				type: "p",
				children: convertBnInline(block.content),
			};
			if (textAlign) el.textAlign = textAlign;
			applyBnBlockColors(el, block.props);
			output.push(el);
			break;
		}
	}
}

// ---------------------------------------------------------------------------
// BlockNote inline content conversion
// ---------------------------------------------------------------------------

/**
 * Convert BlockNote inline content items to Slate text/inline nodes.
 *
 * BlockNote inline content uses `{ type: "text", text, styles }` for text,
 * `{ type: "link", href, content }` for links, and
 * `{ type: "mention", props }` for mentions.
 */
function convertBnInline(content?: BnInlineContent[] | string): SlateNode[] {
	if (!content) return [{ text: "" }];
	if (typeof content === "string") return [{ text: content }];
	if (content.length === 0) return [{ text: "" }];

	const result: SlateNode[] = [];

	for (const item of content) {
		if (item.type === "text") {
			const textNode: SlateNode = { text: item.text ?? "" };

			if (item.styles) {
				if (item.styles.bold) textNode.bold = true;
				if (item.styles.italic) textNode.italic = true;
				if (item.styles.underline) textNode.underline = true;
				if (item.styles.strikethrough) textNode.strikethrough = true;
				if (item.styles.code) textNode.code = true;
				if (item.styles.highlight) textNode.highlight = true;
				if (item.styles.superscript) textNode.superscript = true;
				if (item.styles.subscript) textNode.subscript = true;
				if (item.styles.kbd) textNode.kbd = true;
				if (
					typeof item.styles.textColor === "string" &&
					item.styles.textColor !== "default"
				) {
					textNode.color = item.styles.textColor;
				}
				if (
					typeof item.styles.backgroundColor === "string" &&
					item.styles.backgroundColor !== "default"
				) {
					textNode.backgroundColor = item.styles.backgroundColor;
				}
			}

			result.push(textNode);
		} else if (item.type === "link") {
			result.push({
				type: "a",
				url: item.href ?? "",
				children: convertBnInline(item.content),
			});
		} else if (item.type === "mention") {
			const label =
				item.props?.label ?? item.props?.name ?? item.props?.id ?? "";
			result.push({
				type: "mention",
				value: String(label),
				userId: item.props?.userId,
				children: [{ text: "" }],
			});
		} else {
			// Unknown inline type — extract text if available
			result.push({ text: item.text ?? "" });
		}
	}

	return result.length > 0 ? result : [{ text: "" }];
}

// ---------------------------------------------------------------------------
// BlockNote table helper
// ---------------------------------------------------------------------------

/**
 * Convert a BlockNote table block to Slate table structure.
 * BlockNote tables use `children` for rows, with each row's cells
 * stored as `children` of the row block.
 */
function convertBnTable(block: BnBlock): SlateNode {
	const rows = block.children ?? [];
	return {
		type: "table",
		children: rows.map((row) => ({
			type: "tr",
			children: (row.children ?? []).map((cell) => ({
				type: "td",
				children: [{ type: "p", children: convertBnInline(cell.content) }],
			})),
		})),
	};
}

// ---------------------------------------------------------------------------
// BlockNote block colors helper
// ---------------------------------------------------------------------------

/**
 * Apply block-level text/background colors from BlockNote block props.
 */
function applyBnBlockColors(
	el: SlateNode,
	props?: Record<string, unknown>,
): void {
	if (!props) return;

	if (props.textColor && props.textColor !== "default") {
		el.color = props.textColor;
	}
	if (props.backgroundColor && props.backgroundColor !== "default") {
		el.backgroundColor = props.backgroundColor;
	}
}

// ---------------------------------------------------------------------------
// Markdown → Slate JSON converter
// ---------------------------------------------------------------------------

/**
 * Heuristic: does this text look like markdown?
 * Checks for common markdown syntax patterns. Needs at least 2 signals
 * to avoid false positives on plain text that happens to contain `*` etc.
 */
export function looksLikeMarkdown(text: string): boolean {
	const lines = text.split("\n");
	let signals = 0;

	for (const line of lines) {
		const trimmed = line.trim();
		if (/^#{1,6}\s+/.test(trimmed)) signals++; // heading
		if (/^\s*[-*+]\s+/.test(line)) signals++; // bullet list
		if (/^\s*\d+\.\s+/.test(line)) signals++; // numbered list
		if (/^\|.+\|/.test(trimmed)) signals++; // table row
		if (/^```/.test(trimmed)) signals++; // code fence
		if (/^>\s+/.test(trimmed)) signals++; // blockquote
		if (/^([-*_])\1{2,}\s*$/.test(trimmed)) signals++; // horizontal rule
		if (/\*\*.+?\*\*/.test(line)) signals++; // bold
		if (/\[.+?\]\(.+?\)/.test(line)) signals++; // link
	}

	return signals >= 2;
}

/**
 * Parse inline markdown (bold, italic, code, links, strikethrough) into
 * Slate inline nodes.
 */
function parseInlineMarkdown(text: string): SlateNode[] {
	if (!text) return [{ text: "" }];

	const result: SlateNode[] = [];
	// Order matters: bold (**) before italic (*), backtick before others
	const pattern =
		/(\*\*(.+?)\*\*)|(`([^`]+)`)|(~~(.+?)~~)|(\[([^\]]+)\]\(([^)]+)\))|(\*(.+?)\*)/g;

	let lastIndex = 0;
	let match: RegExpExecArray | null = pattern.exec(text);

	while (match !== null) {
		// Text before the match
		if (match.index > lastIndex) {
			result.push({ text: text.slice(lastIndex, match.index) });
		}

		if (match[1]) {
			// Bold: **text**
			result.push({ text: match[2], bold: true });
		} else if (match[3]) {
			// Code: `text`
			result.push({ text: match[4], code: true });
		} else if (match[5]) {
			// Strikethrough: ~~text~~
			result.push({ text: match[6], strikethrough: true });
		} else if (match[7]) {
			// Link: [text](url)
			result.push({
				type: "a",
				url: match[9],
				children: [{ text: match[8] }],
			});
		} else if (match[10]) {
			// Italic: *text*
			result.push({ text: match[11], italic: true });
		}

		lastIndex = match.index + match[0].length;
		match = pattern.exec(text);
	}

	// Remaining text
	if (lastIndex < text.length) {
		result.push({ text: text.slice(lastIndex) });
	}

	return result.length > 0 ? result : [{ text: "" }];
}

/**
 * Parse a markdown table row into cell strings.
 */
function parseMdTableRow(line: string): string[] {
	return line
		.split("|")
		.map((c) => c.trim())
		.filter(Boolean);
}

/**
 * Convert a markdown string to Slate JSON nodes.
 *
 * Handles headings, bold/italic/code/links, bullet & numbered lists,
 * code blocks (fenced), blockquotes, horizontal rules, and tables.
 */
export function markdownToSlate(markdown: string): SlateNode[] {
	const lines = markdown.split("\n");
	const nodes: SlateNode[] = [];
	let i = 0;

	while (i < lines.length) {
		const line = lines[i];
		const trimmed = line.trim();

		// ── Fenced code block ───────────────────────────────────────
		if (trimmed.startsWith("```")) {
			const lang = trimmed.slice(3).trim();
			const codeLines: string[] = [];
			i++;
			while (i < lines.length && !lines[i].trim().startsWith("```")) {
				codeLines.push(lines[i]);
				i++;
			}
			i++; // skip closing ```
			nodes.push({
				type: "code_block",
				lang,
				children:
					codeLines.length > 0
						? codeLines.map((l) => ({
								type: "code_line",
								children: [{ text: l }],
							}))
						: [{ type: "code_line", children: [{ text: "" }] }],
			});
			continue;
		}

		// ── Heading (# to ######) ───────────────────────────────────
		const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)/);
		if (headingMatch) {
			const level = Math.min(headingMatch[1].length, 6);
			nodes.push({
				type: `h${level}`,
				children: parseInlineMarkdown(headingMatch[2]),
			});
			i++;
			continue;
		}

		// ── Table (| ... | with separator row) ──────────────────────
		if (
			trimmed.startsWith("|") &&
			i + 1 < lines.length &&
			/^\|[\s:|-]+\|$/.test(lines[i + 1].trim())
		) {
			const headers = parseMdTableRow(line);
			i++; // header row
			i++; // separator row
			const dataRows: string[][] = [];
			while (i < lines.length && lines[i].trim().startsWith("|")) {
				dataRows.push(parseMdTableRow(lines[i]));
				i++;
			}
			nodes.push({
				type: "table",
				children: [
					{
						type: "tr",
						children: headers.map((h) => ({
							type: "th",
							children: [{ type: "p", children: parseInlineMarkdown(h) }],
						})),
					},
					...dataRows.map((row) => ({
						type: "tr",
						children: row.map((cell) => ({
							type: "td",
							children: [{ type: "p", children: parseInlineMarkdown(cell) }],
						})),
					})),
				],
			});
			continue;
		}

		// ── Blockquote (> ...) ──────────────────────────────────────
		if (trimmed.startsWith("> ")) {
			const quoteLines: string[] = [];
			while (i < lines.length && lines[i].trim().startsWith("> ")) {
				quoteLines.push(lines[i].trim().slice(2));
				i++;
			}
			nodes.push({
				type: "blockquote",
				children: [
					{ type: "p", children: parseInlineMarkdown(quoteLines.join(" ")) },
				],
			});
			continue;
		}

		// ── Horizontal rule (---, ***, ___) ─────────────────────────
		if (/^([-*_])\1{2,}\s*$/.test(trimmed)) {
			nodes.push({ type: "hr", children: [{ text: "" }] });
			i++;
			continue;
		}

		// ── Checkbox list (- [ ] or - [x]) ──────────────────────────
		const checkMatch = line.match(/^(\s*)[-*+]\s+\[([ xX])\]\s+(.*)/);
		if (checkMatch) {
			const indent = Math.floor(checkMatch[1].length / 2) + 1;
			nodes.push({
				type: "p",
				indent,
				listStyleType: "todo",
				checked: checkMatch[2].toLowerCase() === "x",
				children: parseInlineMarkdown(checkMatch[3]),
			});
			i++;
			continue;
		}

		// ── Bullet list (- or * or +) ───────────────────────────────
		const bulletMatch = line.match(/^(\s*)([-*+])\s+(.*)/);
		if (bulletMatch) {
			const indent = Math.floor(bulletMatch[1].length / 2) + 1;
			nodes.push({
				type: "p",
				indent,
				listStyleType: "disc",
				children: parseInlineMarkdown(bulletMatch[3]),
			});
			i++;
			continue;
		}

		// ── Numbered list (1. 2. etc.) ──────────────────────────────
		const numberedMatch = line.match(/^(\s*)\d+\.\s+(.*)/);
		if (numberedMatch) {
			const indent = Math.floor(numberedMatch[1].length / 2) + 1;
			nodes.push({
				type: "p",
				indent,
				listStyleType: "decimal",
				children: parseInlineMarkdown(numberedMatch[2]),
			});
			i++;
			continue;
		}

		// ── Empty line (skip) ───────────────────────────────────────
		if (trimmed === "") {
			i++;
			continue;
		}

		// ── Paragraph (default) ─────────────────────────────────────
		nodes.push({
			type: "p",
			children: parseInlineMarkdown(trimmed),
		});
		i++;
	}

	return nodes.length > 0 ? nodes : [{ type: "p", children: [{ text: "" }] }];
}

// ---------------------------------------------------------------------------
// Plain text → Slate JSON converter
// ---------------------------------------------------------------------------

/**
 * Convert plain text to Slate JSON.
 * Splits on newlines, creating one paragraph per line.
 *
 * Returns null for empty/whitespace-only input.
 */
export function plainTextToSlate(text: string): SlateNode[] | null {
	if (!text.trim()) return null;
	return text.split("\n").map((line) => ({
		type: "p",
		children: [{ text: line }],
	}));
}

// ---------------------------------------------------------------------------
// Universal content parser
// ---------------------------------------------------------------------------

/**
 * Parse any content string into Slate JSON nodes.
 *
 * Detection order: Slate JSON → BlockNote JSON → ProseMirror/TipTap JSON → Markdown → plain text.
 *
 * This replaces the duplicated `parseContent()` functions in the simple editors.
 */
export function parseAnyContentToSlate(
	content: string | undefined,
): SlateNode[] | undefined {
	if (!content) return undefined;

	const format = detectContentFormat(content);

	switch (format) {
		case "slate": {
			try {
				return JSON.parse(content);
			} catch {
				return undefined;
			}
		}

		case "blocknote": {
			try {
				return blockNoteToSlate(JSON.parse(content));
			} catch {
				return undefined;
			}
		}

		case "prosemirror": {
			try {
				return prosemirrorToSlate(JSON.parse(content));
			} catch {
				return undefined;
			}
		}

		case "markdown": {
			return markdownToSlate(content);
		}

		case "plain": {
			return plainTextToSlate(content) ?? undefined;
		}
	}
}

// ---------------------------------------------------------------------------
// Universal text extraction (for previews, inbox, issue sidebars)
// ---------------------------------------------------------------------------

/**
 * Extract plain text from any content string for preview/display contexts.
 *
 * Handles all content formats (Slate JSON, BlockNote JSON, ProseMirror/TipTap JSON,
 * plain text) by converting to Slate first, then extracting text.
 *
 * Returns the original string if parsing fails or content is plain text.
 */
export function extractTextFromContent(content: string): string {
	if (!content) return "";
	const nodes = parseAnyContentToSlate(content);
	if (!nodes) return content;
	return extractTextFromSlate(nodes);
}

// ---------------------------------------------------------------------------
// Text extraction from Slate JSON
// ---------------------------------------------------------------------------

/**
 * Extract plain text from Slate JSON nodes.
 *
 * Recursively walks the node tree collecting text from text leaves.
 * Handles all element types (paragraphs, headings, lists, code blocks,
 * links, mentions, tables, etc.).
 *
 * @param nodes - Slate Value (array of top-level element nodes)
 * @param maxLength - Optional max length; result is truncated with "..." if exceeded
 */
export function extractTextFromSlate(
	nodes: unknown[],
	maxLength?: number,
): string {
	if (!Array.isArray(nodes) || nodes.length === 0) return "";

	/** Collect inline text fragments from a node (no separators). */
	function collectInline(node: Record<string, unknown>): string {
		// Text leaf node
		if (typeof node.text === "string") {
			return node.text;
		}

		// Mention node — extract the display value
		if (node.type === "mention" && typeof node.value === "string") {
			return `@${node.value}`;
		}

		// Recurse into children, concatenating inline text
		if (Array.isArray(node.children)) {
			return (node.children as Record<string, unknown>[])
				.map(collectInline)
				.join("");
		}

		return "";
	}

	// Collect text per top-level block, then join blocks with spaces
	const blockTexts: string[] = [];
	for (const node of nodes) {
		if (node && typeof node === "object") {
			const text = collectInline(node as Record<string, unknown>);
			if (text) blockTexts.push(text);
		}
	}

	const full = blockTexts.join(" ");
	if (maxLength && full.length > maxLength) {
		return `${full.substring(0, maxLength)}...`;
	}
	return full;
}
