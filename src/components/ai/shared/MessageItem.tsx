"use client";

import type { UIMessage } from "@convex-dev/agent/react";
import type { FileUIPart } from "ai";
import type { LucideIcon } from "lucide-react";
import {
	AlertCircle,
	Bell,
	ChevronDown,
	FileText,
	Globe,
	Layers,
	Loader2,
	MessageSquare,
	Pencil,
	PlusCircle,
	Search,
	Tag,
	Timer,
	UserPlus,
	Users,
} from "lucide-react";
import { memo, useCallback, useMemo, useState } from "react";
import { ArtifactCard } from "@/components/ai/ArtifactCard";
import {
	hasCustomBlocks,
	ModeSuggestCardRenderer,
	parseCustomBlocks,
	TodoListCardRenderer,
} from "@/components/ai/ChatBlockRenderer";
import type { SearchResult } from "@/components/ai/SearchResultCard";
import { SearchResultsList } from "@/components/ai/SearchResultsList";
import {
	type AnySourcePart,
	isSourcePart,
	SourcesList,
} from "@/components/ai/SourceCitation";
import { StreamdownRenderer } from "@/components/ai/StreamdownRenderer";
import {
	ApprovalCard,
	type ApprovalStatus,
} from "@/components/ai/shared/ApprovalCard";
import {
	Attachment,
	AttachmentInfo,
	AttachmentPreview,
	Attachments,
} from "@/components/ai-elements/attachments";
import {
	ChainOfThought,
	ChainOfThoughtContent,
	ChainOfThoughtHeader,
	ChainOfThoughtStep,
} from "@/components/ai-elements/chain-of-thought";
import { Message, MessageContent } from "@/components/ai-elements/message";
import {
	Reasoning,
	ReasoningContent,
	ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import { useWorkspaceOptional } from "@/components/providers/workspace-context";
import { useCurrentUser } from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PixelCIcon } from "@/components/ui/pixel-c-icon";
import { extractArtifacts, filterArtifactCards } from "@/lib/ai/artifact-utils";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

export type ToolApprovalData = {
	approvalId: string;
	status: ApprovalStatus;
	description: string;
	resultMessage?: string;
	onApprove: () => Promise<void>;
	onReject: () => Promise<void>;
};

// ── Tool metadata ────────────────────────────────────────────────────────

type ToolMeta = {
	label: string;
	icon: LucideIcon;
};

const TOOL_META: Record<string, ToolMeta> = {
	searchIssues: { label: "Search issues", icon: Search },
	listProjects: { label: "List projects", icon: Layers },
	getIssueDetails: { label: "Get issue details", icon: FileText },
	getDocument: { label: "Get document", icon: FileText },
	getProjectDetails: { label: "Get project details", icon: Layers },
	globalSearch: { label: "Search workspace", icon: Globe },
	createIssue: { label: "Create issue", icon: PlusCircle },
	updateIssue: { label: "Update issue", icon: Pencil },
	addComment: { label: "Add comment", icon: MessageSquare },
	assignIssue: { label: "Assign issue", icon: UserPlus },
	batchUpdateIssues: { label: "Batch update issues", icon: Layers },
	createDocument: { label: "Create document", icon: FileText },
	createProject: { label: "Create project", icon: PlusCircle },
	createLabel: { label: "Create label", icon: Tag },
	searchDocuments: { label: "Search documents", icon: Search },
	getNotifications: { label: "Get notifications", icon: Bell },
	getActivity: { label: "Get activity", icon: Timer },
	listWorkspaceMembers: { label: "List members", icon: Users },
	listLabels: { label: "List labels", icon: Tag },
	listSprints: { label: "List sprints", icon: Timer },
};

function getToolMeta(toolName: string): ToolMeta {
	return TOOL_META[toolName] ?? { label: toolName, icon: Search };
}

// ── Tool part helpers ────────────────────────────────────────────────────

type ToolPart = {
	type: string;
	toolCallId: string;
	state:
		| "input-streaming"
		| "input-available"
		| "output-available"
		| "output-error";
	input?: unknown;
	output?: unknown;
	errorText?: string;
	toolName?: string;
};

type ReasoningPart = {
	type: "reasoning";
	text: string;
};

function isToolPart(part: { type: string }): part is ToolPart {
	return part.type.startsWith("tool-") || part.type === "dynamic-tool";
}

function isReasoningPart(part: { type: string }): part is ReasoningPart {
	return part.type === "reasoning";
}

function getToolPartName(part: ToolPart): string {
	if (part.type === "dynamic-tool") return part.toolName ?? "unknown";
	return part.type.slice(5); // Remove "tool-" prefix
}

/** Map tool part state to ChainOfThoughtStep status */
function mapToolStatus(
	state: ToolPart["state"],
): "active" | "complete" | "pending" {
	switch (state) {
		case "input-streaming":
		case "input-available":
			return "active";
		case "output-available":
		case "output-error":
			return "complete";
	}
}

/** Derive a key from parts for memo comparison */
function partsKey(parts: UIMessage["parts"]): string {
	let key = "";
	for (const p of parts) {
		if (isToolPart(p as { type: string })) {
			const tp = p as ToolPart;
			key += `t:${tp.type}:${tp.state},`;
		} else if (isReasoningPart(p as { type: string })) {
			const rp = p as ReasoningPart;
			key += `r:${rp.text?.length ?? 0},`;
		} else if (isSourcePart(p as { type: string })) {
			const sp = p as AnySourcePart;
			key += `s:${sp.sourceId},`;
		} else if (p.type === "text") {
			const tp = p as { text: string };
			key += `x:${tp.text?.length ?? 0},`;
		}
	}
	return key;
}

// ── Avatar components ───────────────────────────────────────────────────

export function AssistantAvatar() {
	return (
		<div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-sienna-500/10 dark:bg-sienna-500/20">
			<PixelCIcon size={14} color="var(--color-sienna-500)" />
		</div>
	);
}

function _UserAvatar() {
	const user = useCurrentUser();
	const name = user?.name ?? "You";
	const initial = name[0]?.toUpperCase() ?? "U";

	return (
		<Avatar size="sm">
			{user?.image ? <AvatarImage src={user.image} alt={name} /> : null}
			<AvatarFallback className="text-[10px] font-medium">
				{initial}
			</AvatarFallback>
		</Avatar>
	);
}

// ── Streaming indicator ──────────────────────────────────────────────────

export function StreamingDots() {
	return (
		<div className="flex items-center gap-1 py-1">
			<span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
			<span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
			<span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
		</div>
	);
}

// ── Tool group rendering ─────────────────────────────────────────────────

type ToolGroupItem = {
	key: string;
	toolName: string;
	state: ToolPart["state"];
	errorText?: string;
	input?: unknown;
	output?: unknown;
	approval?: ToolApprovalData;
};

/** Extract a short result summary from tool output */
function getResultSummary(_toolName: string, output: unknown): string | null {
	if (!output || typeof output !== "object") return null;
	const o = output as Record<string, unknown>;

	// Tools that return a message field
	if (typeof o.message === "string") return o.message;

	// Search results with a count
	if (Array.isArray(o.results)) {
		return `Found ${o.results.length} result${o.results.length !== 1 ? "s" : ""}`;
	}
	if (typeof o.totalCount === "number") {
		return `Found ${o.totalCount} result${o.totalCount !== 1 ? "s" : ""}`;
	}

	// Approval results
	if (o.needsApproval === true) return null; // Handled by ApprovalCard

	return null;
}

/** Collapsible JSON args viewer */
function ToolArgsDetail({ input }: { input: unknown }) {
	const [isOpen, setIsOpen] = useState(false);
	const toggle = useCallback(() => setIsOpen((prev) => !prev), []);

	if (
		!input ||
		(typeof input === "object" &&
			Object.keys(input as Record<string, unknown>).length === 0)
	) {
		return null;
	}

	let formatted: string;
	try {
		formatted = JSON.stringify(input, null, 2);
	} catch {
		return null;
	}

	return (
		<div className="mt-1">
			<button
				type="button"
				onClick={toggle}
				className="flex items-center gap-1 text-[10px] text-muted-foreground/70 transition-colors hover:text-muted-foreground"
			>
				<ChevronDown
					className={cn(
						"size-3 transition-transform",
						isOpen ? "rotate-0" : "-rotate-90",
					)}
				/>
				{isOpen ? "Hide args" : "Show args"}
			</button>
			{isOpen && (
				<pre className="mt-1 max-h-40 overflow-auto rounded border border-border/50 bg-muted/50 p-2 text-[10px] leading-relaxed text-muted-foreground">
					{formatted}
				</pre>
			)}
		</div>
	);
}

function ToolGroupBlock({ tools }: { tools: ToolGroupItem[] }) {
	// Separate approval tools (render standalone) from regular tools (ChainOfThought)
	const regularTools = tools.filter((t) => !t.approval);
	const approvalTools = tools.filter((t) => t.approval);

	const hasActive = regularTools.some(
		(t) => t.state === "input-streaming" || t.state === "input-available",
	);

	return (
		<>
			{regularTools.length > 0 && (
				<ChainOfThought
					key={`cot-${regularTools[0].key}`}
					defaultOpen={hasActive}
				>
					<ChainOfThoughtHeader>
						{hasActive
							? `Using ${regularTools.length} tool${regularTools.length > 1 ? "s" : ""}...`
							: `Used ${regularTools.length} tool${regularTools.length > 1 ? "s" : ""}`}
					</ChainOfThoughtHeader>
					<ChainOfThoughtContent>
						{regularTools.map((tool) => {
							const meta = getToolMeta(tool.toolName);
							const resultSummary =
								tool.state === "output-available"
									? getResultSummary(tool.toolName, tool.output)
									: null;
							return (
								<ChainOfThoughtStep
									key={tool.key}
									icon={
										tool.state === "input-streaming" ||
										tool.state === "input-available"
											? Loader2
											: tool.state === "output-error"
												? AlertCircle
												: meta.icon
									}
									label={meta.label}
									status={mapToolStatus(tool.state)}
									description={
										tool.state === "output-error"
											? (tool.errorText ?? "Failed")
											: resultSummary
									}
								>
									<ToolArgsDetail input={tool.input} />
								</ChainOfThoughtStep>
							);
						})}
					</ChainOfThoughtContent>
				</ChainOfThought>
			)}
			{approvalTools.map((tool) => {
				const a = tool.approval;
				if (!a) return null;
				return (
					<ApprovalCard
						key={tool.key}
						description={a.description}
						status={a.status}
						resultMessage={a.resultMessage}
						onApprove={a.onApprove}
						onReject={a.onReject}
					/>
				);
			})}
		</>
	);
}

// ── Memoized message components ──────────────────────────────────────────

export const UserMessage = memo(function UserMessage({
	message,
}: {
	message: UIMessage;
}) {
	const userFiles = message.parts.filter(
		(part): part is FileUIPart =>
			part.type === "file" && "url" in part && typeof part.url === "string",
	);

	// System-style messages (mode switch, etc.) — render as a small centered pill
	if (message.text?.startsWith("::mode-switch::")) {
		const label = message.text.replace("::mode-switch::", "").trim();
		return (
			<div className="flex justify-center py-1">
				<span className="inline-flex items-center gap-1.5 rounded-full bg-muted/50 px-3 py-1 text-[11px] text-muted-foreground">
					<span className="h-1.5 w-1.5 rounded-full bg-sienna-500" />
					{label}
				</span>
			</div>
		);
	}

	return (
		<div className="flex justify-end">
			<Message from="user">
				<MessageContent>
					{message.text ? <span>{message.text}</span> : null}
					{userFiles.length > 0 && (
						<Attachments variant="inline">
							{userFiles.map((file, index) => (
								<Attachment
									key={`${message.id}-file-${index}-${file.url}`}
									data={{
										id: `${message.id}-file-${index}`,
										type: "file",
										url: file.url,
										mediaType: file.mediaType,
										filename: file.filename,
									}}
								>
									<AttachmentPreview />
									<AttachmentInfo />
								</Attachment>
							))}
						</Attachments>
					)}
				</MessageContent>
			</Message>
		</div>
	);
});

export type AssistantMessageProps = {
	message: UIMessage;
	approvalsByToolCallId?: Map<string, ToolApprovalData>;
};

export const AssistantMessage = memo(
	function AssistantMessage({
		message,
		approvalsByToolCallId,
	}: AssistantMessageProps) {
		const isStreaming = message.status === "streaming";
		const parts = message.parts;
		const workspace = useWorkspaceOptional();
		const workspaceSlug = workspace?.workspaceSlug ?? "";

		const hasToolParts = parts.some((p) => isToolPart(p as { type: string }));
		const hasReasoningParts = parts.some(
			(p) =>
				isReasoningPart(p as { type: string }) && !!(p as ReasoningPart).text,
		);

		// Collect source parts for the Sources section (memoized to prevent SourcesList re-renders)
		const sourceParts = useMemo(
			() =>
				parts.filter((p) =>
					isSourcePart(p as { type: string }),
				) as AnySourcePart[],
			[parts],
		);

		// Extract artifacts from completed messages (client-side heuristic)
		const artifacts = useMemo(
			() => extractArtifacts(message.text, message.status),
			[message.text, message.status],
		);
		const artifactCards = useMemo(
			() => filterArtifactCards(artifacts),
			[artifacts],
		);

		// Simple path — no tool parts, no reasoning, render text or streaming dots
		if (!hasToolParts && !hasReasoningParts) {
			return (
				<Message from="assistant">
					<MessageContent>
						{message.text ? (
							hasCustomBlocks(message.text) ? (
								parseCustomBlocks(message.text).map((block, bi) => {
									const stableKey =
										"content" in block
											? block.content
											: block.type === "todo-list"
												? JSON.stringify(block.items)
												: `${block.type}:${block.mode}:${block.description}`;

									return block.type === "mode-suggest" ? (
										<ModeSuggestCardRenderer
											key={`ms-${stableKey}`}
											mode={block.mode}
											description={block.description}
										/>
									) : block.type === "todo-list" ? (
										<TodoListCardRenderer
											key={`tl-${stableKey}`}
											items={block.items}
										/>
									) : (
										<StreamdownRenderer
											key={`tx-${stableKey}`}
											content={block.content}
											isStreaming={
												bi === parseCustomBlocks(message.text).length - 1 &&
												isStreaming
											}
										/>
									);
								})
							) : (
								<StreamdownRenderer
									content={message.text}
									isStreaming={isStreaming}
								/>
							)
						) : isStreaming ? (
							<StreamingDots />
						) : null}
						{artifactCards.map((artifact) => (
							<ArtifactCard key={artifact.id} artifact={artifact} />
						))}
						<SourcesList sources={sourceParts} />
					</MessageContent>
				</Message>
			);
		}

		// Parts-aware path — render reasoning, tool calls (ChainOfThought), and text
		const rendered: React.JSX.Element[] = [];
		let textBuffer = "";
		let toolGroup: ToolGroupItem[] = [];
		let pendingSearchResults: SearchResult[] | null = null;

		// Helper: render text with custom block support
		function renderTextContent(
			content: string,
			key: string,
			streaming: boolean,
		) {
			if (hasCustomBlocks(content)) {
				const blocks = parseCustomBlocks(content);
				for (let bi = 0; bi < blocks.length; bi++) {
					const block = blocks[bi];
					if (block.type === "mode-suggest") {
						rendered.push(
							<ModeSuggestCardRenderer
								key={`${key}-ms-${bi}`}
								mode={block.mode}
								description={block.description}
							/>,
						);
					} else if (block.type === "todo-list") {
						rendered.push(
							<TodoListCardRenderer
								key={`${key}-tl-${bi}`}
								items={block.items}
							/>,
						);
					} else {
						rendered.push(
							<StreamdownRenderer
								key={`${key}-tx-${bi}`}
								content={block.content}
								isStreaming={bi === blocks.length - 1 && streaming}
							/>,
						);
					}
				}
			} else {
				rendered.push(
					<StreamdownRenderer
						key={key}
						content={content}
						isStreaming={streaming}
					/>,
				);
			}
		}

		// Determine if reasoning is still streaming (no text parts generated yet)
		const hasTextParts = parts.some(
			(p) => p.type === "text" && (p as { text: string }).text,
		);
		const isReasoningStreaming = isStreaming && !hasTextParts;

		function flushToolGroup() {
			if (toolGroup.length === 0) return;
			rendered.push(
				<ToolGroupBlock
					key={`tg-${toolGroup[0].key}`}
					tools={[...toolGroup]}
				/>,
			);

			// Render search results below the tool group if globalSearch returned data
			if (pendingSearchResults && workspaceSlug) {
				rendered.push(
					<SearchResultsList
						key={`search-${toolGroup[0].key}`}
						results={pendingSearchResults}
						workspaceSlug={workspaceSlug}
					/>,
				);
				pendingSearchResults = null;
			}

			toolGroup = [];
		}

		for (let i = 0; i < parts.length; i++) {
			const part = parts[i];

			// ── Reasoning part ───────────────────────────────────────────
			if (isReasoningPart(part as { type: string })) {
				const rp = part as ReasoningPart;
				// Skip empty reasoning parts (API returned reasoning tokens
				// but no summary text, e.g. during tool-call steps)
				if (!rp.text && !isReasoningStreaming) {
					continue;
				}
				flushToolGroup();
				if (textBuffer) {
					renderTextContent(textBuffer, `text-${i}`, false);
					textBuffer = "";
				}
				rendered.push(
					<Reasoning
						key={`reasoning-${i}`}
						className="w-full"
						isStreaming={isReasoningStreaming}
					>
						<ReasoningTrigger />
						<ReasoningContent>{rp.text ?? ""}</ReasoningContent>
					</Reasoning>,
				);
				continue;
			}

			// ── Text part ────────────────────────────────────────────────
			if (part.type === "text") {
				flushToolGroup();
				textBuffer += (part as { text: string }).text;
				continue;
			}

			// ── Tool part ────────────────────────────────────────────────
			if (isToolPart(part as { type: string })) {
				const tp = part as ToolPart;

				// Flush accumulated text before tool group
				if (textBuffer) {
					renderTextContent(textBuffer, `text-${i}`, false);
					textBuffer = "";
				}

				// Track globalSearch results for rich rendering
				const toolName = getToolPartName(tp);
				if (
					toolName === "globalSearch" &&
					tp.state === "output-available" &&
					tp.output
				) {
					const output = tp.output as {
						results?: SearchResult[];
					};
					if (output.results && Array.isArray(output.results)) {
						pendingSearchResults = output.results;
					}
				}

				const approval = approvalsByToolCallId?.get(tp.toolCallId);
				toolGroup.push({
					key: tp.toolCallId,
					toolName,
					state: tp.state,
					errorText: tp.errorText,
					input: tp.input,
					output: tp.output,
					approval,
				});
			}

			// Skip other part types (step-start, etc.)
		}

		// Flush remaining tool group
		flushToolGroup();

		// Flush remaining text (last segment may still be streaming)
		if (textBuffer) {
			renderTextContent(textBuffer, "text-final", isStreaming);
		}

		// If nothing rendered and still streaming, show dots
		if (rendered.length === 0 && isStreaming) {
			rendered.push(<StreamingDots key="dots" />);
		}

		return (
			<Message from="assistant">
				<MessageContent>
					{rendered}
					{artifactCards.map((artifact) => (
						<ArtifactCard key={artifact.id} artifact={artifact} />
					))}
					<SourcesList sources={sourceParts} />
				</MessageContent>
			</Message>
		);
	},
	(prev, next) =>
		prev.message.text === next.message.text &&
		prev.message.status === next.message.status &&
		prev.approvalsByToolCallId === next.approvalsByToolCallId &&
		partsKey(prev.message.parts) === partsKey(next.message.parts),
);
