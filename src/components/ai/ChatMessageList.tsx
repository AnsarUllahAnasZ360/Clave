"use client";

import { useEffect, useRef } from "react";
import {
	SubAgentProgressCard,
	type SubAgentProgressCardProps,
} from "@/components/ai/SubAgentProgressCard";
import { SubAgentResultCard } from "@/components/ai/SubAgentResultCard";
import {
	ConversationView,
	type ConversationViewProps,
} from "@/components/ai/shared/ConversationView";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

export type SubAgentInvocation = {
	/** Unique ID for this invocation (UUID or timestamp-based) */
	id: string;
	/** "progress" while running, "result" when complete, "error" on failure */
	status: "progress" | "result" | "error";
	/** Sub-agent display name */
	agentName: string;
	/** Sub-agent emoji avatar */
	agentAvatar?: string;
	/** "direct" for immediate execution, "workflow" for durable workflow */
	executionType: "direct" | "workflow";
	/** Workflow run ID (only for workflow execution) */
	workflowRunId?: SubAgentProgressCardProps["workflowRunId"];
	/** When the invocation started */
	startedAt: number;
	/** Result text (when status === "result") */
	resultText?: string;
	/** When the invocation completed (when status === "result") */
	completedAt?: number;
	/** Thread ID of the sub-agent's response thread */
	threadId?: string;
	/** Error message (when status === "error") */
	errorMessage?: string;
};

export interface ChatMessageListProps extends ConversationViewProps {
	/** Active and completed sub-agent invocations to render */
	invocations: SubAgentInvocation[];
}

// ── Component ────────────────────────────────────────────────────────────

/**
 * Wraps `ConversationView` with inline sub-agent progress and result cards.
 *
 * Manages the rendering of `SubAgentProgressCard` (while processing) and
 * `SubAgentResultCard` (when complete) below the regular message list.
 * Auto-scrolls to bottom when new invocations are added.
 */
export function ChatMessageList({
	invocations,
	...conversationProps
}: ChatMessageListProps) {
	const bottomRef = useRef<HTMLDivElement>(null);

	// Auto-scroll when invocations change
	useEffect(() => {
		if (invocations.length > 0) {
			bottomRef.current?.scrollIntoView({ behavior: "smooth" });
		}
	}, [invocations.length]);

	const hasInvocations = invocations.length > 0;

	return (
		<div className="flex min-h-0 flex-1 flex-col">
			{/* Regular message list */}
			<ConversationView
				{...conversationProps}
				className={cn(conversationProps.className, "min-h-0 flex-1")}
			/>

			{/* Sub-agent invocation cards */}
			{hasInvocations && (
				<div className="space-y-3 border-t border-border/30 px-4 py-3">
					{invocations.map((inv) => {
						if (inv.status === "progress") {
							return (
								<SubAgentProgressCard
									key={inv.id}
									agentName={inv.agentName}
									agentAvatar={inv.agentAvatar}
									executionType={inv.executionType}
									workflowRunId={inv.workflowRunId}
									startedAt={inv.startedAt}
								/>
							);
						}

						if (inv.status === "result" && inv.resultText) {
							return (
								<SubAgentResultCard
									key={inv.id}
									agentName={inv.agentName}
									agentAvatar={inv.agentAvatar}
									result={inv.resultText}
									completedAt={inv.completedAt ?? Date.now()}
									threadId={inv.threadId}
								/>
							);
						}

						if (inv.status === "error") {
							return (
								<SubAgentResultCard
									key={inv.id}
									agentName={inv.agentName}
									agentAvatar={inv.agentAvatar}
									result={inv.errorMessage ?? "An error occurred"}
									completedAt={inv.completedAt ?? Date.now()}
									className="border-l-red-500 border-red-200 bg-red-50/50 dark:border-red-900/50 dark:border-l-red-400 dark:bg-red-950/20"
								/>
							);
						}

						return null;
					})}
					<div ref={bottomRef} />
				</div>
			)}
		</div>
	);
}
