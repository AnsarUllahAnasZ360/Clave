"use node";

/**
 * Central embedded AI action dispatcher.
 * Every non-chat AI invocation in the product calls this action.
 *
 * Flow: auth check → context loading → prompt composition → AI call → return result
 */

import { generateText } from "ai";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import { type ActionCtx, action, internalAction } from "../_generated/server";
import { extractPlainTextFromBody } from "./embedded_helpers";
import { DEFAULT_CHAT_MODEL_ID } from "./modelIds";
import {
	documentContinuePrompt,
	documentExpandPrompt,
	documentFixGrammarPrompt,
	documentImprovePrompt,
	documentRewritePrompt,
	documentSummarizePrompt,
	documentTranslatePrompt,
	documentWriteFromPromptFn,
} from "./prompts/document_prompts";
import {
	issueAIMentionPrompt,
	issueAutoTriagePrompt,
	issueDetectDuplicatesPrompt,
	issueDraftDescriptionPrompt,
	issueReplyCommentPrompt,
	issueSummarizeActivityPrompt,
} from "./prompts/issue_prompts";
import {
	projectPlanSprintPrompt,
	projectStatusReportPrompt,
	projectStatusSummaryPrompt,
} from "./prompts/project_prompts";
import {
	whiteboardCleanupLayoutPrompt,
	whiteboardExplainDiagramPrompt,
	whiteboardGenerateDiagramPrompt,
} from "./prompts/whiteboard_prompts";
import { chatModel, getReasoningProviderOptions } from "./providers";
import { getProjectNamespace, getRag } from "./rag";
import {
	extractElementsPayload,
	inferGenerationMode,
	sanitizeDrawableElements,
	validateGeneratedElements,
} from "./whiteboardMcp";

// ── Result type ──────────────────────────────────────────────────────────

type EmbeddedResult = {
	type: string;
	text: string;
	data?: unknown;
	error?: string;
};

const AI_GENERATION_TIMEOUT_MS = 120_000;
const MAX_SCENE_ELEMENTS_IN_PROMPT = 80;
const MAX_CONTINUE_CONTEXT_CHARS = 8_000;
const MAX_SUMMARY_CONTEXT_CHARS = 12_000;
const EMBEDDED_REASONING_OPTIONS = getReasoningProviderOptions(
	DEFAULT_CHAT_MODEL_ID,
);

function normalizeEditorContext(input?: string): string {
	if (!input) return "";
	return extractPlainTextFromBody(input).replace(/\s+/g, " ").trim();
}

function clampContextWindow(
	content: string,
	maxChars: number,
	options?: { preferTail?: boolean },
): string {
	if (content.length <= maxChars) return content;
	if (options?.preferTail) {
		return content.slice(-maxChars);
	}
	const headSize = Math.floor(maxChars * 0.6);
	const tailSize = maxChars - headSize;
	return `${content.slice(0, headSize)}\n...\n${content.slice(-tailSize)}`;
}

// ── Helper: safe AI call ─────────────────────────────────────────────────

async function callAI(
	systemPrompt: string,
	options?: {
		maxOutputTokens?: number;
		timeoutMs?: number;
		maxRetries?: number;
	},
): Promise<string> {
	const result = await generateText({
		model: chatModel(),
		prompt: systemPrompt,
		maxOutputTokens: options?.maxOutputTokens ?? 1024,
		timeout: options?.timeoutMs ?? AI_GENERATION_TIMEOUT_MS,
		// Keep retries low to preserve responsiveness for embedded actions.
		maxRetries: options?.maxRetries ?? 1,
		...(EMBEDDED_REASONING_OPTIONS
			? { providerOptions: EMBEDDED_REASONING_OPTIONS }
			: {}),
	});
	return result.text ?? "";
}

function parseJsonResponse(text: string): unknown {
	// Strip markdown code fences if present
	const cleaned = text
		.replace(/^```(?:json)?\s*/i, "")
		.replace(/\s*```$/i, "")
		.trim();
	try {
		return JSON.parse(cleaned);
	} catch {
		// Continue to tolerant extraction below.
	}

	// Tolerant mode: extract the first balanced JSON object/array from text.
	const start = cleaned.search(/[{[]/);
	if (start === -1) return null;

	const openChar = cleaned[start];
	const closeChar = openChar === "{" ? "}" : "]";
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
		if (ch === openChar) {
			depth += 1;
			continue;
		}
		if (ch === closeChar) {
			depth -= 1;
			if (depth === 0) {
				const candidate = cleaned.slice(start, i + 1);
				try {
					return JSON.parse(candidate);
				} catch {
					return null;
				}
			}
		}
	}

	return null;
}

function compactWhiteboardScene(sceneData?: string): string | undefined {
	if (!sceneData) return undefined;

	try {
		const parsed = JSON.parse(sceneData) as unknown;
		if (!Array.isArray(parsed)) return undefined;

		const compact = parsed
			.filter((item) => item && typeof item === "object")
			.filter(
				(item) =>
					(item as { isDeleted?: unknown }).isDeleted !== true &&
					typeof (item as { type?: unknown }).type === "string",
			)
			.slice(0, MAX_SCENE_ELEMENTS_IN_PROMPT)
			.map((item) => {
				const el = item as Record<string, unknown>;
				return {
					id: typeof el.id === "string" ? el.id : undefined,
					type: el.type,
					x: typeof el.x === "number" ? el.x : undefined,
					y: typeof el.y === "number" ? el.y : undefined,
					width: typeof el.width === "number" ? el.width : undefined,
					height: typeof el.height === "number" ? el.height : undefined,
					text: typeof el.text === "string" ? el.text : undefined,
					label:
						el.label && typeof el.label === "object"
							? {
									text:
										typeof (el.label as { text?: unknown }).text === "string"
											? (el.label as { text: string }).text
											: undefined,
								}
							: undefined,
					startBinding:
						el.startBinding && typeof el.startBinding === "object"
							? {
									elementId:
										typeof (el.startBinding as { elementId?: unknown })
											.elementId === "string"
											? (el.startBinding as { elementId: string }).elementId
											: undefined,
								}
							: undefined,
					endBinding:
						el.endBinding && typeof el.endBinding === "object"
							? {
									elementId:
										typeof (el.endBinding as { elementId?: unknown })
											.elementId === "string"
											? (el.endBinding as { elementId: string }).elementId
											: undefined,
								}
							: undefined,
				};
			});

		return JSON.stringify(compact);
	} catch {
		return undefined;
	}
}

function stub(type: string): EmbeddedResult {
	return { type, text: "Not yet implemented", data: undefined };
}

async function loadWritingEntityContext(
	ctx: ActionCtx,
	context: {
		documentId?: Id<"documents">;
		issueId?: Id<"issues">;
		projectId?: Id<"projects">;
	},
): Promise<{ title: string; content?: string; error?: string }> {
	if (context.documentId) {
		const doc = (await ctx.runQuery(
			internal.ai.embedded_helpers.loadDocumentContext,
			{
				documentId: context.documentId,
			},
		)) as { title: string; content?: string } | null;
		if (!doc) {
			return { title: "Untitled", error: "Document not found" };
		}
		return {
			title: doc.title,
			content: normalizeEditorContext(doc.content),
		};
	}

	if (context.issueId) {
		const issue = (await ctx.runQuery(
			internal.ai.embedded_helpers.loadIssueContext,
			{
				issueId: context.issueId,
			},
		)) as { title: string; description?: string } | null;
		if (!issue) {
			return { title: "Untitled", error: "Issue not found" };
		}
		return {
			title: issue.title,
			content: normalizeEditorContext(issue.description),
		};
	}

	if (context.projectId) {
		const project = (await ctx.runQuery(
			internal.ai.embedded_helpers.loadProjectContext,
			{ projectId: context.projectId },
		)) as { name: string; description?: string } | null;
		if (!project) {
			return { title: "Untitled", error: "Project not found" };
		}
		return {
			title: project.name,
			content: normalizeEditorContext(project.description),
		};
	}

	return { title: "Untitled" };
}

// ── Main Dispatcher ──────────────────────────────────────────────────────

export const embeddedAction = action({
	args: {
		type: v.union(
			// Document AI
			v.literal("document_continue"),
			v.literal("document_improve"),
			v.literal("document_summarize"),
			v.literal("document_rewrite"),
			v.literal("document_translate"),
			v.literal("document_expand"),
			v.literal("document_fix_grammar"),
			v.literal("document_write_from_prompt"),
			// Issue AI
			v.literal("issue_auto_triage"),
			v.literal("issue_draft_description"),
			v.literal("issue_detect_duplicates"),
			v.literal("issue_summarize_activity"),
			v.literal("issue_reply_comment"),
			v.literal("issue_ai_mention"),
			// Whiteboard AI
			v.literal("whiteboard_generate_diagram"),
			v.literal("whiteboard_explain_diagram"),
			v.literal("whiteboard_cleanup_layout"),
			// Project AI
			v.literal("project_status_summary"),
			v.literal("project_status_report"),
			v.literal("project_plan_sprint"),
			// Search
			v.literal("semantic_search"),
			// Notifications
			v.literal("notification_digest"),
		),
		context: v.object({
			workspaceId: v.id("workspaces"),
			projectId: v.optional(v.id("projects")),
			documentId: v.optional(v.id("documents")),
			issueId: v.optional(v.id("issues")),
			whiteboardId: v.optional(v.id("whiteboards")),
		}),
		prompt: v.optional(v.string()),
		selectedText: v.optional(v.string()),
		targetLanguage: v.optional(v.string()),
		whiteboard: v.optional(
			v.object({
				generation: v.optional(
					v.object({
						mode: v.union(
							v.literal("wireframe"),
							v.literal("flowchart"),
							v.literal("architecture"),
						),
						appType: v.optional(v.string()),
						coreSections: v.optional(v.string()),
						keyActions: v.optional(v.string()),
						density: v.optional(
							v.union(
								v.literal("compact"),
								v.literal("balanced"),
								v.literal("detailed"),
							),
						),
					}),
				),
				explain: v.optional(
					v.object({
						scope: v.optional(
							v.union(v.literal("selection"), v.literal("canvas")),
						),
					}),
				),
			}),
		),
	},
	returns: v.object({
		type: v.string(),
		text: v.string(),
		data: v.optional(v.any()),
		error: v.optional(v.string()),
	}),
	handler: async (ctx, args): Promise<EmbeddedResult> => {
		// 1. Auth check
		let _userId: Id<"users">;
		try {
			_userId = await ctx.runQuery(internal.ai.chatQueries.validateAuth, {
				workspaceId: args.context.workspaceId,
			});
		} catch {
			return {
				type: args.type,
				text: "",
				error: "Not authenticated or not a workspace member",
			};
		}

		try {
			// 2. Dispatch by action type
			switch (args.type) {
				// ── Document actions ──────────────────────────────────
				case "document_continue": {
					const inlineContext = normalizeEditorContext(args.prompt);
					const entityContext = await loadWritingEntityContext(
						ctx,
						args.context,
					);
					if (entityContext.error && !inlineContext) {
						return {
							type: args.type,
							text: "",
							error: entityContext.error,
						};
					}

					const contentBefore = clampContextWindow(
						inlineContext || entityContext.content || "",
						MAX_CONTINUE_CONTEXT_CHARS,
						{ preferTail: true },
					);
					if (!contentBefore) {
						return {
							type: args.type,
							text: "",
							error: "Nothing above the cursor to continue.",
						};
					}

					const prompt = documentContinuePrompt({
						title: entityContext.title,
						contentBefore,
					});
					const text = await callAI(prompt, { maxOutputTokens: 900 });
					return { type: args.type, text };
				}

				case "document_improve": {
					if (!args.selectedText)
						return {
							type: args.type,
							text: "",
							error: "No text selected",
						};
					const doc = args.context.documentId
						? await ctx.runQuery(
								internal.ai.embedded_helpers.loadDocumentContext,
								{
									documentId: args.context.documentId,
								},
							)
						: null;
					const prompt = documentImprovePrompt({
						title: doc?.title ?? "Untitled",
						selectedText: args.selectedText,
					});
					const text = await callAI(prompt, { maxOutputTokens: 600 });
					return { type: args.type, text };
				}

				case "document_summarize": {
					const inlineContext = normalizeEditorContext(args.prompt);
					const entityContext = await loadWritingEntityContext(
						ctx,
						args.context,
					);
					if (entityContext.error && !inlineContext) {
						return {
							type: args.type,
							text: "",
							error: entityContext.error,
						};
					}

					const content = clampContextWindow(
						inlineContext || entityContext.content || "",
						MAX_SUMMARY_CONTEXT_CHARS,
					);
					if (!content) {
						return {
							type: args.type,
							text: "",
							error: "Nothing to summarize.",
						};
					}

					const prompt = documentSummarizePrompt({
						title: entityContext.title,
						content,
					});
					const text = await callAI(prompt, { maxOutputTokens: 500 });
					return { type: args.type, text };
				}

				case "document_rewrite": {
					if (!args.selectedText)
						return {
							type: args.type,
							text: "",
							error: "No text selected",
						};
					const doc = args.context.documentId
						? await ctx.runQuery(
								internal.ai.embedded_helpers.loadDocumentContext,
								{
									documentId: args.context.documentId,
								},
							)
						: null;
					const prompt = documentRewritePrompt({
						title: doc?.title ?? "Untitled",
						selectedText: args.selectedText,
					});
					const text = await callAI(prompt, { maxOutputTokens: 600 });
					return { type: args.type, text };
				}

				case "document_translate": {
					if (!args.selectedText)
						return {
							type: args.type,
							text: "",
							error: "No text selected",
						};
					const prompt = documentTranslatePrompt({
						selectedText: args.selectedText,
						targetLanguage: args.targetLanguage ?? "English",
					});
					const text = await callAI(prompt, { maxOutputTokens: 600 });
					return { type: args.type, text };
				}

				case "document_expand": {
					if (!args.selectedText)
						return {
							type: args.type,
							text: "",
							error: "No text selected",
						};
					const doc = args.context.documentId
						? await ctx.runQuery(
								internal.ai.embedded_helpers.loadDocumentContext,
								{
									documentId: args.context.documentId,
								},
							)
						: null;
					const prompt = documentExpandPrompt({
						title: doc?.title ?? "Untitled",
						selectedText: args.selectedText,
					});
					const text = await callAI(prompt, { maxOutputTokens: 900 });
					return { type: args.type, text };
				}

				case "document_fix_grammar": {
					if (!args.selectedText)
						return {
							type: args.type,
							text: "",
							error: "No text selected",
						};
					const prompt = documentFixGrammarPrompt({
						selectedText: args.selectedText,
					});
					const text = await callAI(prompt, { maxOutputTokens: 500 });
					return { type: args.type, text };
				}

				case "document_write_from_prompt": {
					if (!args.prompt)
						return {
							type: args.type,
							text: "",
							error: "No prompt provided",
						};
					const entityContext = await loadWritingEntityContext(
						ctx,
						args.context,
					);
					if (
						entityContext.error &&
						(args.context.documentId ||
							args.context.issueId ||
							args.context.projectId)
					) {
						return {
							type: args.type,
							text: "",
							error: entityContext.error,
						};
					}
					const prompt = documentWriteFromPromptFn({
						title: entityContext.title,
						prompt: args.prompt,
						contentBefore: entityContext.content ?? undefined,
					});
					const text = await callAI(prompt, { maxOutputTokens: 1200 });
					return { type: args.type, text };
				}

				// ── Issue actions ─────────────────────────────────────
				case "issue_auto_triage": {
					const issue = args.context.issueId
						? await ctx.runQuery(
								internal.ai.embedded_helpers.loadIssueContext,
								{
									issueId: args.context.issueId,
								},
							)
						: null;
					const title = issue?.title ?? args.prompt ?? "Untitled issue";
					const labels = await ctx.runQuery(
						internal.ai.embedded_helpers.loadWorkspaceLabels,
						{ workspaceId: args.context.workspaceId },
					);
					const prompt = issueAutoTriagePrompt({
						title,
						description: issue?.description ?? undefined,
						existingLabels: labels,
					});
					const text = await callAI(prompt, { maxOutputTokens: 450 });
					const data = parseJsonResponse(text);
					return {
						type: args.type,
						text: data
							? ((data as { reasoning?: string }).reasoning ?? text)
							: text,
						data,
					};
				}

				case "issue_draft_description": {
					const issue = args.context.issueId
						? await ctx.runQuery(
								internal.ai.embedded_helpers.loadIssueContext,
								{
									issueId: args.context.issueId,
								},
							)
						: null;
					const title = issue?.title ?? args.prompt ?? "Untitled issue";
					const prompt = issueDraftDescriptionPrompt({
						title,
						priority: issue?.priority,
						type: issue?.type,
					});
					const text = await callAI(prompt, { maxOutputTokens: 700 });
					return { type: args.type, text };
				}

				case "issue_detect_duplicates": {
					const issue = args.context.issueId
						? await ctx.runQuery(
								internal.ai.embedded_helpers.loadIssueContext,
								{
									issueId: args.context.issueId,
								},
							)
						: null;
					const title = issue?.title ?? args.prompt ?? "Untitled issue";
					// Load recent issues for comparison
					const backlogIssues = args.context.projectId
						? await ctx.runQuery(
								internal.ai.embedded_helpers.loadBacklogIssues,
								{
									projectId: args.context.projectId,
								},
							)
						: [];
					const prompt = issueDetectDuplicatesPrompt({
						title,
						description: issue?.description ?? undefined,
						existingIssues: backlogIssues,
					});
					const text = await callAI(prompt, { maxOutputTokens: 700 });
					const data = parseJsonResponse(text);
					return { type: args.type, text, data };
				}

				case "issue_summarize_activity": {
					if (!args.context.issueId)
						return {
							type: args.type,
							text: "",
							error: "No issue ID provided",
						};
					const issue = await ctx.runQuery(
						internal.ai.embedded_helpers.loadIssueContext,
						{ issueId: args.context.issueId },
					);
					if (!issue)
						return {
							type: args.type,
							text: "",
							error: "Issue not found",
						};
					const comments = await ctx.runQuery(
						internal.ai.embedded_helpers.loadIssueComments,
						{ issueId: args.context.issueId },
					);
					const prompt = issueSummarizeActivityPrompt({
						title: issue.title,
						description: issue.description ?? undefined,
						comments,
					});
					const text = await callAI(prompt, { maxOutputTokens: 600 });
					return { type: args.type, text };
				}

				case "issue_reply_comment": {
					const issue = args.context.issueId
						? await ctx.runQuery(
								internal.ai.embedded_helpers.loadIssueContext,
								{
									issueId: args.context.issueId,
								},
							)
						: null;
					const prompt = issueReplyCommentPrompt({
						issueTitle: issue?.title ?? "Unknown issue",
						commentBody: args.selectedText ?? args.prompt ?? "",
						commentAuthor: "User",
					});
					const text = await callAI(prompt, { maxOutputTokens: 600 });
					return { type: args.type, text };
				}

				case "issue_ai_mention": {
					const issue = args.context.issueId
						? await ctx.runQuery(
								internal.ai.embedded_helpers.loadIssueContext,
								{
									issueId: args.context.issueId,
								},
							)
						: null;
					const prompt = issueAIMentionPrompt({
						issueTitle: issue?.title ?? "Unknown issue",
						issueDescription: issue?.description ?? undefined,
						mentionPrompt: args.prompt ?? "",
					});
					const text = await callAI(prompt, { maxOutputTokens: 600 });
					return { type: args.type, text };
				}

				// ── Whiteboard actions ────────────────────────────────
				case "whiteboard_generate_diagram": {
					if (!args.prompt)
						return {
							type: args.type,
							text: "",
							error: "No prompt provided",
						};
					const wb = args.context.whiteboardId
						? await ctx.runQuery(
								internal.ai.embedded_helpers.loadWhiteboardContext,
								{
									whiteboardId: args.context.whiteboardId,
								},
							)
						: null;
					const mode =
						args.whiteboard?.generation?.mode ??
						inferGenerationMode(args.prompt);

					// The prompt includes the vendored official Excalidraw MCP element
					// reference, but we keep board context compact to avoid generation
					// timeouts on large canvases.
					const generationPrompt = whiteboardGenerateDiagramPrompt({
						title: wb?.title ?? "Untitled board",
						prompt: args.prompt,
						existingElements: compactWhiteboardScene(wb?.sceneData),
						mode,
						generation: args.whiteboard?.generation,
					});

					// Attempt generation with retry on failure.
					const MAX_GENERATION_TOKENS = 8192;
					let lastError: string | null = null;

					for (let attempt = 0; attempt < 2; attempt++) {
						try {
							const generatedText = await callAI(
								attempt === 0
									? generationPrompt
									: `${generationPrompt}\n\nIMPORTANT: Previous attempt failed. Return a SIMPLER diagram with fewer elements (max 15 shapes). Ensure valid JSON with an "elements" array.`,
								{
									maxOutputTokens: MAX_GENERATION_TOKENS,
									timeoutMs: AI_GENERATION_TIMEOUT_MS,
								},
							);
							const parsed = parseJsonResponse(generatedText);
							const elements = sanitizeDrawableElements(
								extractElementsPayload(parsed),
							);
							const quality = validateGeneratedElements(elements, mode);

							if (elements.length > 0) {
								return {
									type: args.type,
									text: `Generated ${mode} diagram`,
									data: { mode, elements, quality },
								};
							}

							// Last resort: check for nodes/edges format
							if (parsed && typeof parsed === "object") {
								const parsedRecord = parsed as Record<string, unknown>;
								if (
									Array.isArray(parsedRecord.elements) ||
									Array.isArray(parsedRecord.nodes) ||
									Array.isArray(parsedRecord.edges)
								) {
									return {
										type: args.type,
										text: `Generated ${mode} diagram`,
										data: { mode, ...parsedRecord },
									};
								}
							}

							lastError =
								quality.issues.length > 0
									? `Quality issues: ${quality.issues.join("; ")}`
									: "No valid elements in AI response";
						} catch (error) {
							lastError =
								error instanceof Error ? error.message : "Generation failed";
							console.warn(
								`[embedded:whiteboard_generate_diagram] attempt ${attempt + 1} failed:`,
								lastError,
							);
						}
					}

					// Both attempts failed — return a clear error instead of silent fallback
					return {
						type: args.type,
						text: "",
						error: `Diagram generation failed after 2 attempts: ${lastError ?? "unknown error"}. Try a simpler prompt or fewer elements.`,
					};
				}

				case "whiteboard_explain_diagram": {
					if (!args.context.whiteboardId)
						return {
							type: args.type,
							text: "",
							error: "No whiteboard ID provided",
						};
					const wb = await ctx.runQuery(
						internal.ai.embedded_helpers.loadWhiteboardContext,
						{ whiteboardId: args.context.whiteboardId },
					);
					if (!wb)
						return {
							type: args.type,
							text: "",
							error: "Whiteboard not found",
						};
					// Use client-sent compact serialization when available (via prompt field),
					// fall back to raw sceneData from DB
					const elementsDesc = args.prompt ?? wb.sceneData ?? "[]";
					const prompt = whiteboardExplainDiagramPrompt({
						title: wb.title,
						elements: elementsDesc,
						scope: args.whiteboard?.explain?.scope,
					});
					const text = await callAI(prompt, { maxOutputTokens: 900 });
					return { type: args.type, text };
				}

				case "whiteboard_cleanup_layout": {
					if (!args.context.whiteboardId)
						return {
							type: args.type,
							text: "",
							error: "No whiteboard ID provided",
						};
					const wb = await ctx.runQuery(
						internal.ai.embedded_helpers.loadWhiteboardContext,
						{ whiteboardId: args.context.whiteboardId },
					);
					if (!wb)
						return {
							type: args.type,
							text: "",
							error: "Whiteboard not found",
						};
					const elementsDesc = args.prompt ?? wb.sceneData ?? "[]";
					const prompt = whiteboardCleanupLayoutPrompt({
						title: wb.title,
						elements: elementsDesc,
					});
					const text = await callAI(prompt, { maxOutputTokens: 1000 });
					const data = parseJsonResponse(text);
					return { type: args.type, text, data };
				}

				// ── Project actions ───────────────────────────────────
				case "project_status_summary": {
					if (!args.context.projectId)
						return {
							type: args.type,
							text: "",
							error: "No project ID provided",
						};
					const project = await ctx.runQuery(
						internal.ai.embedded_helpers.loadProjectContext,
						{ projectId: args.context.projectId },
					);
					if (!project)
						return {
							type: args.type,
							text: "",
							error: "Project not found",
						};
					const stats = await ctx.runQuery(
						internal.ai.embedded_helpers.loadProjectIssueStats,
						{ projectId: args.context.projectId },
					);
					const prompt = projectStatusSummaryPrompt({
						projectName: project.name,
						projectDescription: project.description ?? undefined,
						issueStats: stats,
					});
					const text = await callAI(prompt, { maxOutputTokens: 700 });
					const data = parseJsonResponse(text);
					return { type: args.type, text, data };
				}

				case "project_status_report": {
					if (!args.context.projectId)
						return {
							type: args.type,
							text: "",
							error: "No project ID provided",
						};
					const project = await ctx.runQuery(
						internal.ai.embedded_helpers.loadProjectContext,
						{ projectId: args.context.projectId },
					);
					if (!project)
						return {
							type: args.type,
							text: "",
							error: "Project not found",
						};
					const stats = await ctx.runQuery(
						internal.ai.embedded_helpers.loadProjectIssueStats,
						{ projectId: args.context.projectId },
					);
					const milestones = await ctx.runQuery(
						internal.ai.embedded_helpers.loadProjectMilestones,
						{ projectId: args.context.projectId },
					);
					const prompt = projectStatusReportPrompt({
						projectName: project.name,
						projectDescription: project.description ?? undefined,
						milestones: milestones.map(
							(m: {
								name: string;
								status: string;
								progress: number;
								issueCount: number;
								completedCount: number;
								targetDate?: string;
							}) => ({
								name: m.name,
								progress: m.progress,
								dueDate: m.targetDate,
								status: m.status,
								issueCount: m.issueCount,
								completedCount: m.completedCount,
							}),
						),
						issueStats: stats,
					});
					const text = await callAI(prompt, { maxOutputTokens: 1400 });
					return { type: args.type, text };
				}

				case "project_plan_sprint": {
					if (!args.context.projectId)
						return {
							type: args.type,
							text: "",
							error: "No project ID provided",
						};
					const project = await ctx.runQuery(
						internal.ai.embedded_helpers.loadProjectContext,
						{ projectId: args.context.projectId },
					);
					if (!project)
						return {
							type: args.type,
							text: "",
							error: "Project not found",
						};
					const backlog = await ctx.runQuery(
						internal.ai.embedded_helpers.loadBacklogIssues,
						{ projectId: args.context.projectId },
					);
					const velocity = await ctx.runQuery(
						internal.ai.embedded_helpers.loadSprintVelocity,
						{ projectId: args.context.projectId },
					);
					const prompt = projectPlanSprintPrompt({
						projectName: project.name,
						backlogIssues: backlog,
						completedLastSprint: velocity.lastSprintCompleted,
						avgVelocity: velocity.avgIssuesPerSprint,
						completedSprints: velocity.completedSprints,
					});
					const text = await callAI(prompt, { maxOutputTokens: 1000 });
					const data = parseJsonResponse(text);
					return { type: args.type, text, data };
				}

				// ── Semantic search ──────────────────────────────────
				case "semantic_search": {
					const searchQuery = args.prompt?.trim();
					if (!searchQuery) {
						return {
							type: args.type,
							text: "",
							error: "No search query provided",
						};
					}

					// Get all project IDs in the workspace
					const projectIds = await ctx.runQuery(
						internal.ai.embedded_helpers.loadWorkspaceProjectIds,
						{ workspaceId: args.context.workspaceId },
					);

					if (projectIds.length === 0) {
						return {
							type: args.type,
							text: "No projects found in this workspace.",
							data: { results: [] },
						};
					}

					// Search across all project namespaces
					const perProjectLimit = Math.max(
						3,
						Math.ceil(10 / projectIds.length),
					);
					type SemanticResult = {
						sourceType: string;
						sourceId: string;
						title: string;
						snippet: string;
						score: number;
						projectId: string;
					};
					const resultGroups = await Promise.all(
						projectIds.map(async (pid) => {
							try {
								const ns = getProjectNamespace(pid);
								const res = await getRag().search(ctx, {
									namespace: ns,
									query: searchQuery,
									limit: perProjectLimit,
								});
								const mapped: SemanticResult[] = [];
								for (let i = 0; i < res.entries.length; i++) {
									const entry = res.entries[i];
									const meta = entry.metadata as
										| Record<string, unknown>
										| undefined;
									const text = entry.text ?? "";
									mapped.push({
										sourceType: (meta?.sourceType as string) ?? "unknown",
										sourceId: (meta?.sourceId as string) ?? "",
										title: entry.title ?? "",
										snippet:
											text.length > 150 ? `${text.slice(0, 147)}...` : text,
										score: res.results[i]?.score ?? 0,
										projectId: pid,
									});
								}
								return mapped;
							} catch {
								// Namespace may not exist — skip
								return [];
							}
						}),
					);
					const allResults = resultGroups.flat();

					// Sort by score descending, take top 10
					allResults.sort((a, b) => b.score - a.score);
					const topResults = allResults.slice(0, 10);

					return {
						type: args.type,
						text:
							topResults.length > 0
								? `Found ${topResults.length} results`
								: "No results found — try keyword search instead.",
						data: { results: topResults },
					};
				}

				// ── Notification digest ──────────────────────────────
				case "notification_digest": {
					const notifications = await ctx.runQuery(
						internal.ai.embedded_helpers.loadRecentNotifications,
						{
							userId: _userId,
							workspaceId: args.context.workspaceId,
						},
					);
					const overdueIssues = await ctx.runQuery(
						internal.ai.embedded_helpers.loadUserOverdueIssues,
						{
							userId: _userId,
							workspaceId: args.context.workspaceId,
						},
					);

					if (notifications.length === 0 && overdueIssues.length === 0) {
						return {
							type: args.type,
							text: "All clear! Nothing needs your attention today.",
							data: {
								categories: [],
								isEmpty: true,
							},
						};
					}

					const notifSummary = notifications
						.slice(0, 50)
						.map(
							(
								n: {
									type: string;
									title: string;
									issueIdentifier?: string;
									actorName?: string;
									isRead: boolean;
								},
								i: number,
							) =>
								`${i + 1}. [${n.type}] ${n.title}${n.issueIdentifier ? ` (${n.issueIdentifier})` : ""}${n.actorName ? ` — by ${n.actorName}` : ""}${n.isRead ? "" : " [UNREAD]"}`,
						)
						.join("\n");

					const overdueSummary = overdueIssues
						.map(
							(i: {
								identifier: string;
								title: string;
								priority: string;
								status: string;
							}) =>
								`- ${i.identifier}: ${i.title} (priority: ${i.priority}, status: ${i.status})`,
						)
						.join("\n");

					const digestPrompt = `You are an AI assistant for a project management workspace. Analyze the user's recent notifications and overdue issues, then produce a daily digest.

RECENT NOTIFICATIONS (last 48 hours):
${notifSummary || "None"}

OVERDUE ISSUES ASSIGNED TO USER:
${overdueSummary || "None"}

Categorize items into exactly these categories:
- "urgent": Overdue issues, critical mentions, high-priority assignments
- "needs_reply": Unanswered questions, mentions awaiting response
- "good_news": Completed items, positive progress, milestones reached
- "review": Items needing review, status changes, project updates

Return ONLY valid JSON in this exact format:
{
  "greeting": "A brief, friendly greeting like 'Good morning! Here\\'s what matters today:'",
  "categories": [
    {
      "type": "urgent" | "needs_reply" | "good_news" | "review",
      "label": "Human-readable label",
      "items": [
        {
          "text": "Brief description of the item",
          "entityType": "issue" | "document" | "project" | "whiteboard" | null,
          "entityId": "identifier or null",
          "issueIdentifier": "e.g. MIL-247 or null"
        }
      ]
    }
  ]
}

Rules:
- Only include categories that have items (skip empty categories)
- Maximum 3 items per category
- Keep item text under 80 characters
- Prioritize unread and actionable items
- If there's truly nothing important, return just a greeting with empty categories`;

					const digestText = await callAI(digestPrompt, {
						maxOutputTokens: 700,
					});
					const digestData = parseJsonResponse(digestText);
					return {
						type: args.type,
						text:
							(digestData as { greeting?: string })?.greeting ??
							"Here's your daily digest",
						data: digestData,
					};
				}

				default:
					return stub(args.type);
			}
		} catch (err) {
			console.error(
				`[embedded:${args.type}] error:`,
				err instanceof Error ? err.message : err,
			);
			return {
				type: args.type,
				text: "",
				error:
					err instanceof Error ? err.message : "An unexpected error occurred",
			};
		}
	},
});

/**
 * Internal action: handles @AI mention in comments.
 * Called via scheduler from comment creation mutations.
 */
export const handleAIMention = internalAction({
	args: {
		commentId: v.id("comments"),
		workspaceId: v.id("workspaces"),
		issueId: v.optional(v.id("issues")),
		taskId: v.optional(v.id("tasks")),
		storyId: v.optional(v.id("stories")),
		whiteboardId: v.optional(v.id("whiteboards")),
		parentId: v.optional(v.id("comments")),
		commentBody: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		try {
			// 1. Get or create AI system user
			const aiUserId = await ctx.runMutation(
				internal.ai.embedded_helpers.getOrCreateAIUser,
				{ workspaceId: args.workspaceId },
			);

			// 2. Load entity context
			let entityContext = "";
			if (args.issueId) {
				const issue = await ctx.runQuery(
					internal.ai.embedded_helpers.loadIssueContext,
					{ issueId: args.issueId },
				);
				if (issue) {
					entityContext = `Issue ${issue.identifier}: ${issue.title}\nStatus: ${issue.status}, Priority: ${issue.priority}\n${issue.description ? `Description: ${issue.description}` : ""}`;
				}
			} else if (args.whiteboardId) {
				const wb = await ctx.runQuery(
					internal.ai.embedded_helpers.loadWhiteboardContext,
					{ whiteboardId: args.whiteboardId },
				);
				if (wb) {
					entityContext = `Whiteboard: ${wb.title}`;
				}
			}

			// 3. Load thread context
			const threadComments = await ctx.runQuery(
				internal.ai.embedded_helpers.loadCommentThread,
				{ parentId: args.parentId, commentId: args.commentId },
			);
			const threadContext = threadComments
				.map((c: { author: string; body: string }) => `${c.author}: ${c.body}`)
				.join("\n");

			// 4. Extract the user's message from the comment body
			const userMessage = extractPlainTextFromBody(args.commentBody);

			// 5. Compose prompt and call AI
			const prompt = issueAIMentionPrompt({
				issueTitle: entityContext || "General discussion",
				issueDescription: undefined,
				mentionPrompt: userMessage,
				threadContext: threadContext || undefined,
			});
			const responseText = await callAI(prompt, { maxOutputTokens: 600 });

			if (!responseText.trim()) return null;

			// 6. Create AI reply comment
			// For whiteboard thread replies, use the root comment as parentId
			const replyParentId = args.whiteboardId
				? (args.parentId ?? args.commentId)
				: undefined;

			await ctx.runMutation(internal.ai.embedded_helpers.createAIReplyComment, {
				issueId: args.issueId,
				taskId: args.taskId,
				storyId: args.storyId,
				whiteboardId: args.whiteboardId,
				parentId: args.issueId ? args.parentId : replyParentId,
				body: responseText,
				aiUserId,
			});
		} catch (err) {
			console.error(
				"[AI mention] Failed to generate response:",
				err instanceof Error ? err.message : err,
			);
			// Post a fallback error message
			try {
				const aiUserId = await ctx.runMutation(
					internal.ai.embedded_helpers.getOrCreateAIUser,
					{ workspaceId: args.workspaceId },
				);
				await ctx.runMutation(
					internal.ai.embedded_helpers.createAIReplyComment,
					{
						issueId: args.issueId,
						taskId: args.taskId,
						storyId: args.storyId,
						whiteboardId: args.whiteboardId,
						parentId: args.parentId,
						body: "I couldn't generate a response. Please try again.",
						aiUserId,
					},
				);
			} catch {
				// Fallback also failed — nothing more to do
			}
		}
		return null;
	},
});

/**
 * Internal action: handles @AI mention in document comments.
 */
export const handleDocumentAIMention = internalAction({
	args: {
		threadId: v.id("documentThreads"),
		documentId: v.id("documents"),
		workspaceId: v.id("workspaces"),
		commentBody: v.string(),
	},
	returns: v.null(),
	handler: async (ctx, args) => {
		try {
			// 1. Get or create AI system user
			const aiUserId = await ctx.runMutation(
				internal.ai.embedded_helpers.getOrCreateAIUser,
				{ workspaceId: args.workspaceId },
			);

			// 2. Load document context
			const doc = await ctx.runQuery(
				internal.ai.embedded_helpers.loadDocumentContext,
				{
					documentId: args.documentId,
				},
			);
			const entityContext = doc
				? `Document: ${doc.title}\n${doc.content ? `Content excerpt: ${doc.content.substring(0, 500)}` : ""}`
				: "Document";

			// 3. Load thread comments for context
			const threadComments = await ctx.runQuery(
				internal.ai.embedded_helpers.loadDocumentThreadComments,
				{ threadId: args.threadId },
			);
			const threadContext = threadComments
				.map((c: { author: string; body: string }) => `${c.author}: ${c.body}`)
				.join("\n");

			// 4. Extract user message
			const userMessage = extractPlainTextFromBody(args.commentBody);

			// 5. Compose prompt and call AI
			const prompt = issueAIMentionPrompt({
				issueTitle: entityContext,
				issueDescription: undefined,
				mentionPrompt: userMessage,
				threadContext: threadContext || undefined,
			});
			const responseText = await callAI(prompt, { maxOutputTokens: 600 });

			if (!responseText.trim()) return null;

			// 6. Create AI reply as document comment
			await ctx.runMutation(
				internal.ai.embedded_helpers.createAIDocumentComment,
				{
					threadId: args.threadId,
					documentId: args.documentId,
					workspaceId: args.workspaceId,
					body: responseText,
					aiUserId,
				},
			);
		} catch (err) {
			console.error(
				"[AI mention] Document comment failed:",
				err instanceof Error ? err.message : err,
			);
			try {
				const aiUserId = await ctx.runMutation(
					internal.ai.embedded_helpers.getOrCreateAIUser,
					{ workspaceId: args.workspaceId },
				);
				await ctx.runMutation(
					internal.ai.embedded_helpers.createAIDocumentComment,
					{
						threadId: args.threadId,
						documentId: args.documentId,
						workspaceId: args.workspaceId,
						body: "I couldn't generate a response. Please try again.",
						aiUserId,
					},
				);
			} catch {
				// Fallback also failed
			}
		}
		return null;
	},
});
