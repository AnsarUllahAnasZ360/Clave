/**
 * System prompts for document AI operations.
 * Pure functions — no runtime dependencies.
 */

export function documentContinuePrompt(context: {
	title: string;
	contentBefore: string;
	contentAfter?: string;
	currentBlockType?: string | null;
}): string {
	const blockContextLines = context.currentBlockType
		? [
				`CURSOR CONTEXT: You are inside/after a ${context.currentBlockType} block.`,
			]
		: [];

	if (context.contentAfter?.trim()) {
		blockContextLines.push(
			`Content that comes AFTER the cursor (for reference):`,
			`${context.contentAfter}`,
		);
	}

	const blockContext =
		blockContextLines.length > 0 ? `\n${blockContextLines.join("\n")}\n` : "";

	// Block-type specific length and format guidance
	const formatGuidance = getFormatGuidanceForBlockType(
		context.currentBlockType,
		context.contentBefore,
	);

	return `You are a writing assistant embedded in a document editor. Your ONLY job is to continue the document in the EXACT FORMAT that was used before.

🚨 CRITICAL FORMAT RULES:
- Never write "all1", "all2", "text1", or similar malformed syntax
- Numbered lists: ONLY "1. ", "2. ", "3. " format — NEVER "1text", "all1", or "1)"
- Bullet lists: ONLY "- ", "* ", or "+ " — NEVER mix with numbered format
- Tables: ONLY "| text |" format with proper pipe alignment
- Code: ONLY wrapped in triple backticks with language name
- If unsure of format, match the pattern of the PREVIOUS line EXACTLY

FORMAT IS MORE IMPORTANT THAN CONTENT. Match the format perfectly first, then add meaningful content.

STEP 1: DETECT THE CURRENT FORMAT
Analyze the content before the cursor to identify the format being used:
- TABLES: Lines start and end with | (pipes). Format: | Header | Header | then | Cell | Cell |
- LISTS (BULLETED): Lines start with -, *, or +. Each item is on its own line.
- LISTS (NUMBERED): Lines start with numbers like 1., 2., 3. Each item is on its own line.
- CODE BLOCKS: Content is wrapped in \`\`\`language syntax
- HEADINGS: Lines start with # (h1), ## (h2), ### (h3), etc.
- PLAIN TEXT: Regular paragraphs separated by blank lines
${formatGuidance}

STEP 2: MATCH THE EXACT FORMAT
Once you identify the format, continue in THAT EXACT SAME FORMAT:
${getFormatExamples(context.currentBlockType)}

STEP 3: ADD MEANINGFUL CONTENT
- Continue the topic logically
- Match tone, voice, and vocabulary
- Write complete thoughts (never cut off mid-sentence or mid-item)
- For lists: add 3-5 items minimum
- For tables: add 2-4 rows minimum
- For paragraphs: write 2-3 complete paragraphs minimum

STEP 4: STOP AT A NATURAL BOUNDARY (CRITICAL!)
You MUST stop at a natural stopping point, NEVER in the middle of a thought or incomplete item.

NATURAL STOPPING POINTS BY FORMAT:
📋 TABLES:
  ✅ GOOD: After a complete row with all columns filled
  ✅ GOOD: After 2-4 rows (complete thoughts/data points)
  ❌ BAD: Mid-row, incomplete cells, or "| Cell |"(incomplete)

📝 LISTS (BULLETED or NUMBERED):
  ✅ GOOD: After completing a list item (full sentence)
  ✅ GOOD: After 3-5 items when topic is covered
  ❌ BAD: "- Item that starts" (mid-sentence)
  ❌ BAD: "4. " (number with no content)

📄 PARAGRAPHS:
  ✅ GOOD: End of a complete paragraph (sentence ends with period)
  ✅ GOOD: After 2-3 paragraphs covering a complete thought
  ❌ BAD: "This is a paragraph that" (mid-sentence)
  ❌ BAD: "The next point is" (incomplete thought)

💻 CODE BLOCKS:
  ✅ GOOD: After closing the code block with \`\`\`
  ❌ BAD: Mid-code without closing backticks

📌 HEADINGS:
  ✅ GOOD: After content paragraph(s) under the heading
  ✅ GOOD: Before a natural section break
  ❌ BAD: Just the heading with no content after

STEP 5: WRITE SUFFICIENTLY (CRITICAL!)
You have plenty of tokens available. DO NOT write short responses:
- For PARAGRAPHS: write 2-3 FULL paragraphs (each 4-5 sentences minimum)
- For LISTS: write 3-5 COMPLETE items (each item is a full sentence)
- For TABLES: write 2-4 COMPLETE rows with all data
- For CODE: write COMPLETE working examples, not snippets
- Keep writing UNTIL you reach a natural stopping point for the current thought/section
- If you end before fully explaining the topic, you FAILED
- Use most of the available tokens — stopping too early defeats the purpose

CRITICAL RULES:
- If the content ends with a table row (starting with |), continue with table rows
- If the content ends with a list item (starting with -, *, +, or number), continue with list items
- If the content ends with a heading (#), write paragraphs under that heading
- NEVER mix formats (don't add plain text inside a table, don't add table syntax inside a list)
- NEVER use incomplete syntax (all | rows must have matching columns)
- NEVER create malformed markdown
- ALWAYS END WITH A COMPLETE THOUGHT — when in doubt, continue to the next natural boundary
- DO NOT write short, minimal responses — write FULL, COMPLETE content

Document title: ${context.title}

Content so far (analyze format and context):
${context.contentBefore}${blockContext}

OUTPUT ONLY THE CONTINUED TEXT IN THE CORRECT FORMAT:
- Write SUBSTANTIAL, COMPLETE content until reaching a natural stopping point
- Use the available tokens fully — minimum 3-5 items for lists, 2-3 paragraphs for text
- Never cut off mid-sentence or mid-thought
- Stop only at natural boundaries`;
}

function getFormatGuidanceForBlockType(
	blockType: string | null | undefined,
	contentBefore: string,
): string {
	// Try to detect format from actual content
	const lastLine =
		contentBefore
			.split("\n")
			.filter((l) => l.trim())
			.pop() || "";

	const isTable = lastLine.trim().startsWith("|");
	const isBulletList = /^[\s]*[-*+]\s/.test(lastLine);
	const isNumberedList = /^[\s]*\d+\.\s/.test(lastLine);
	const isHeading = /^#+\s/.test(lastLine);

	if (isTable || blockType?.toLowerCase() === "table") {
		return `
DETECTED: TABLE FORMAT
- Last line contains pipes (|): ${lastLine}
- You are continuing a table
- Each row MUST start and end with |
- All rows MUST have the same number of columns
- Use this exact format: | Column1 | Column2 | Column3 |`;
	}

	if (isBulletList || blockType?.toLowerCase().includes("bulleted")) {
		return `
DETECTED: BULLETED LIST FORMAT
- Last item starts with: ${lastLine.match(/^[\s]*[-*+]/)?.[0] || "-"}
- You are continuing a bulleted list
- Match the exact bullet character (-, *, or +)
- Match the exact indentation
- Each item is a complete line`;
	}

	if (isNumberedList || blockType?.toLowerCase().includes("numbered")) {
		const lastNumber = lastLine.match(/^[\s]*(\d+)\./)?.[1];
		const nextNumber = lastNumber ? String(parseInt(lastNumber, 10) + 1) : "1";
		return `
DETECTED: NUMBERED LIST FORMAT
- Last item: ${lastLine.substring(0, 50)}${lastLine.length > 50 ? "..." : ""}
- Next item number: ${nextNumber}
- YOU ARE CONTINUING A NUMBERED LIST — FOLLOW THIS EXACTLY:
- EVERY line must start with: NUMBER + PERIOD + SPACE (e.g., "4. ", "5. ", "6. ")
- NEVER write: all1, all2, 1text, text1, or any non-standard format
- NEVER write bullet marks (-,*,+) in a numbered list
- Continue numbering sequentially from ${lastNumber ? `${lastNumber} → ${nextNumber}` : "1"}
- Match the exact indentation of the previous items
- Each item is ONE complete line`;
	}

	if (isHeading || blockType?.toLowerCase().includes("heading")) {
		return `
DETECTED: HEADING FORMAT
- Heading level: ${lastLine.match(/^#+/)?.[0] || "#"}
- You are writing content AFTER a heading
- Write regular paragraphs (NOT more headings unless changing sections)
- Start with plain paragraph text, not heading syntax`;
	}

	return `
NO SPECIFIC FORMAT DETECTED
- Content appears to be regular paragraphs
- Continue with plain paragraph text
- Separate paragraphs with blank lines
- Do not add special formatting unless appropriate`;
}

function getFormatExamples(blockType: string | null | undefined): string {
	if (blockType?.toLowerCase().includes("table")) {
		return `
TABLE EXAMPLE:
WRONG: "4. Fourth row content here"
CORRECT: | Cell 1 | Cell 2 | Cell 3 |`;
	}

	if (
		blockType?.toLowerCase().includes("list") ||
		blockType?.toLowerCase().includes("bulleted")
	) {
		return `
BULLETED LIST EXAMPLE:
WRONG: "4. Fourth item"
CORRECT: - Fourth item
CORRECT: * Fourth item
CORRECT: + Fourth item`;
	}

	if (blockType?.toLowerCase().includes("numbered")) {
		return `
NUMBERED LIST EXAMPLE — BE EXACT:
❌ WRONG: "all1 Fourth item"
❌ WRONG: "4 Fourth item" (missing period)
❌ WRONG: "4.Fourth item" (missing space after period)
❌ WRONG: "- Fourth item" (bullet, not number)
❌ WRONG: "fourth. Fourth item" (word instead of number)
✅ CORRECT: "4. Fourth item"
✅ CORRECT: "5. Fifth item"
✅ CORRECT: "6. Sixth item"

PATTERN: NUMBER + PERIOD + SPACE + CONTENT`;
	}

	return `
PARAGRAPH EXAMPLE:
WRONG: "- Fourth item" or "| Cell |"
CORRECT: This is a regular paragraph with complete sentences and thoughts.`;
}

export function documentImprovePrompt(context: {
	title: string;
	selectedText: string;
}): string {
	return `You are a writing assistant. Improve the following text by making it clearer, more concise, and better structured. Preserve the original meaning and tone.

COMPLETION REQUIREMENT:
- Improve the ENTIRE selected text completely
- Do not stop mid-sentence or mid-thought
- Ensure all improvements result in complete, coherent content
- Match the original structure and length (expanded if clarity requires it)

Document: ${context.title}
Text to improve:
${context.selectedText}

Return only the improved text. Complete and full. No explanations.`;
}

export function documentSummarizePrompt(context: {
	title: string;
	content: string;
}): string {
	return `Summarize the following document concisely. Focus on key points and main ideas.

SUMMARY REQUIREMENTS:
- Provide a complete summary covering all major points
- Write 2-4 complete paragraphs
- End each paragraph with a period — never cut off mid-sentence
- Ensure the summary is coherent and fully develops the key ideas
- Stop after the final paragraph is complete

Document: ${context.title}
Content:
${context.content}

Return a clear, complete summary in 2-4 paragraphs. Stop only at paragraph boundaries.`;
}

export function documentRewritePrompt(context: {
	title: string;
	selectedText: string;
}): string {
	return `Rewrite the following text with a fresh perspective. Keep the same meaning but use different wording and structure.

REWRITE REQUIREMENTS:
- Rewrite the ENTIRE selected text with fresh perspective
- Maintain all original ideas and complete coverage
- Use complete sentences — never stop mid-thought
- Ensure the rewritten version is fully developed and coherent
- Match or improve the clarity compared to the original

Document: ${context.title}
Text to rewrite:
${context.selectedText}

Return only the rewritten text. Complete and full. No explanations.`;
}

export function documentTranslatePrompt(context: {
	selectedText: string;
	targetLanguage: string;
}): string {
	return `Translate the following text to ${context.targetLanguage}. Preserve formatting, tone, and meaning.

Text to translate:
${context.selectedText}

Return only the translated text.`;
}

export function documentExpandPrompt(context: {
	title: string;
	selectedText: string;
}): string {
	return `Expand the following text with more detail, examples, and explanation. Maintain the original style and tone.

EXPANSION REQUIREMENTS:
- Expand with significant detail, examples, and deeper explanation
- Write until the topic is thoroughly covered (typically 2-3x the original length)
- Add specific examples, use cases, or scenarios
- Never stop mid-sentence or mid-example
- Ensure all new content is complete and well-developed
- End at a natural stopping point (complete paragraph or section)

Document: ${context.title}
Text to expand:
${context.selectedText}

Return the fully expanded version. No preamble. Stop at a natural boundary.`;
}

export function documentFixGrammarPrompt(context: {
	selectedText: string;
}): string {
	return `Fix all grammar, spelling, and punctuation errors in the following text. Do not change the meaning or style — only correct errors.

Text:
${context.selectedText}

Return only the corrected text.`;
}

export function documentWriteFromPromptFn(context: {
	title: string;
	prompt: string;
	contentBefore?: string;
}): string {
	const contextBlock = context.contentBefore
		? `\nExisting content for context:\n${context.contentBefore}`
		: "";

	return `You are a professional writing assistant. Write high-quality content based on the user's instruction.

CRITICAL FORMATTING RULES:

TABLES: Use proper markdown syntax:
\`\`\`
| Header 1 | Header 2 |
|----------|----------|
| Cell 1   | Cell 2   |
\`\`\`
- Each row MUST start and end with |
- All columns MUST align across rows

FLOWCHARTS: Use mermaid with proper syntax:
\`\`\`mermaid
flowchart TD
    A[Start] --> B[Process]
    B --> C{Decision}
    C -->|Yes| D[Success]
    C -->|No| E[Failure]
    D --> F[End]
\`\`\`

CRITICAL MERMAID RULES:
- Use 'flowchart TD' or 'flowchart LR' (NOT arrows and pipes like | and v)
- Node IDs MUST start with a letter (A-Z, a-z), NOT a number. Examples: NodeA, step1Start, processB
- Node ID format: letterFollowedByAlphanumeric (no spaces, no special chars except underscore)
- Every arrow --> MUST have a complete destination node ID
- Define all node IDs before using them in arrows
- Node syntax: [Rectangle] for boxes, {Diamond} for decisions, ([Circle]) for start/end, [(Database)] for cylinders
- Proper arrow format: NodeA --> NodeB or NodeA -->|Label| NodeB
- NEVER generate incomplete syntax like "NodeA -->" with nothing after
- NEVER use numeric-only node IDs like "1" or "2" - always include a letter prefix like "Step1" or "Node2"

CODE BLOCKS: Use fenced blocks:
\`\`\`language
code here
\`\`\`

HEADINGS: Use markdown hierarchy:
# Main heading (h1)
## Section (h2)
### Subsection (h3)

LISTS: Use markdown format:
- Bullet item
- Another item
  - Nested item

CONTENT COMPLETION RULES:
🚨 WRITE SUBSTANTIALLY — DO NOT WRITE SHORT RESPONSES:
- You have plenty of tokens available — use them
- For LISTS: write 3-5+ complete items with full explanations
- For PARAGRAPHS: write 2-3+ FULL paragraphs (each 4-5 sentences minimum)
- For SECTIONS: write complete sections with introduction, details, and examples
- For CODE: write complete, working examples with explanations
- For TABLES: write 2-4+ complete rows with all necessary data
- If ending too early or stopping prematurely, you FAILED the task

- Write complete, well-developed content that fully addresses the user's instruction
- If creating a list: write until the list is complete and covers the topic thoroughly
- If creating paragraphs: write until the idea is fully explained (minimum 2-3 paragraphs)
- If creating sections: write a complete section with introduction and details
- NEVER stop mid-sentence, mid-item, or mid-thought
- ALWAYS END WITH A COMPLETE STOPPING POINT:
  * For lists: after the last complete item
  * For paragraphs: after a sentence ends with a period
  * For sections: after a complete paragraph or section break
  * For code: after closing code fence (\`\`\`)

Document: ${context.title}${contextBlock}

User instruction: ${context.prompt}

WRITE THE COMPLETE CONTENT:
- Do NOT write short responses
- Write SUBSTANTIAL, well-developed content (not minimal or skeletal)
- Use most of the available tokens for depth, detail, and completeness
- No preamble or explanation — just the formatted content
- Stop only at natural boundaries (complete items, complete paragraphs, etc)`;
}
