"use client";

import type { UIMessage } from "@convex-dev/agent/react";
import { AlertCircle, Clock, Loader2, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	IncognitoWelcomeScreen,
	SUGGESTION_CHIPS,
	SuggestionChip,
} from "@/components/ai/ChatWelcomeScreen";
import type { ToolApprovalData } from "@/components/ai/shared/MessageItem";
import {
	AssistantMessage,
	UserMessage,
} from "@/components/ai/shared/MessageItem";
import {
	Conversation,
	ConversationContent,
	ConversationEmptyState,
	ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent } from "@/components/ai-elements/message";
import { Button } from "@/components/ui/button";
import { PixelClaveIcon } from "@/components/ui/pixel-clave-icon";
import type { AIToolApproval } from "@/hooks/use-ai-chat";
import type { RetryState } from "@/hooks/use-message-retry";
import type { Id } from "../../../../convex/_generated/dataModel";

// ── Inline error bubble ──────────────────────────────────────────────────

function MessageErrorBubble({
	error,
	onRetry,
	retryState,
	retryCountdown,
}: {
	error: string;
	onRetry?: () => void;
	retryState?: RetryState;
	retryCountdown?: number | null;
}) {
	const isAutoRetrying = retryState === "waiting" || retryState === "retrying";

	return (
		<Message from="assistant">
			<MessageContent>
				<div className="flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2.5">
					<AlertCircle className="mt-0.5 size-4 shrink-0 text-destructive" />
					<div className="flex min-w-0 flex-1 flex-col gap-2">
						<p className="text-sm text-destructive">{error}</p>
						{isAutoRetrying && retryCountdown != null && retryCountdown > 0 && (
							<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<Clock className="size-3 animate-pulse" />
								Retrying in {retryCountdown}s...
							</p>
						)}
						{retryState === "retrying" && (
							<p className="flex items-center gap-1.5 text-xs text-muted-foreground">
								<RotateCcw className="size-3 animate-spin" />
								Retrying...
							</p>
						)}
						{onRetry && !isAutoRetrying && (
							<Button
								variant="outline"
								size="sm"
								onClick={onRetry}
								className="w-fit gap-1.5 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive"
							>
								<RotateCcw className="size-3" />
								{retryState === "exhausted" ? "Try again" : "Retry"}
							</Button>
						)}
					</div>
				</div>
			</MessageContent>
		</Message>
	);
}

// ── ConversationView ─────────────────────────────────────────────────────

export type ConversationViewProps = {
	messages: UIMessage[];
	isSending: boolean;
	isStreaming: boolean;
	isLoadingMessages?: boolean;
	error?: string | null;
	onRetry?: () => void;
	retryState?: RetryState;
	retryCountdown?: number | null;
	onSuggestedPrompt?: (prompt: string) => void;
	className?: string;
	contentClassName?: string;
	approvals?: AIToolApproval[];
	onApproveTool?: (approvalId: Id<"aiToolApprovals">) => Promise<void>;
	onRejectTool?: (approvalId: Id<"aiToolApprovals">) => Promise<void>;
	/** When true, shows incognito empty state instead of regular welcome */
	isIncognito?: boolean;
};

export function ConversationView({
	messages,
	isSending,
	isStreaming,
	isLoadingMessages,
	error,
	onRetry,
	retryState,
	retryCountdown,
	onSuggestedPrompt,
	className,
	contentClassName,
	approvals,
	onApproveTool,
	onRejectTool,
	isIncognito,
}: ConversationViewProps) {
	const hasMessages = messages.length > 0;
	const lastMessage = hasMessages ? messages[messages.length - 1] : null;
	const prevStreamingRef = useRef(isStreaming);

	// Track streaming completion for screen reader announcement
	const [streamingAnnouncement, setStreamingAnnouncement] = useState("");
	useEffect(() => {
		if (prevStreamingRef.current && !isStreaming) {
			setStreamingAnnouncement("AI response complete");
			const timer = setTimeout(() => setStreamingAnnouncement(""), 3000);
			return () => clearTimeout(timer);
		}
		prevStreamingRef.current = isStreaming;
	}, [isStreaming]);

	// Stable refs for callbacks — prevents busting the memo when parent re-renders
	const onApproveRef = useRef(onApproveTool);
	onApproveRef.current = onApproveTool;
	const onRejectRef = useRef(onRejectTool);
	onRejectRef.current = onRejectTool;

	// Build a map of toolCallId → ToolApprovalData for efficient lookup.
	const approvalsByToolCallId = useMemo(() => {
		if (!approvals || approvals.length === 0) return undefined;
		const map = new Map<string, ToolApprovalData>();
		for (const a of approvals) {
			map.set(a.toolCallId, {
				approvalId: a._id,
				status: a.status,
				description: a.description,
				resultMessage: a.resultMessage,
				onApprove: () => onApproveRef.current?.(a._id) ?? Promise.resolve(),
				onReject: () => onRejectRef.current?.(a._id) ?? Promise.resolve(),
			});
		}
		return map;
	}, [approvals]);
	// Show "Thinking..." only when sending AND the last *real* message is from
	// the user (no assistant response has started yet). Using isSending instead
	// of isStreaming avoids showing the spinner after the assistant starts streaming.
	const showInlineThinking =
		isSending && !isStreaming && lastMessage?.role === "user";
	// Show a loading skeleton when paginating — NOT "Thinking..." which implies
	// the AI is generating a response.
	const showInitialLoading = !hasMessages && Boolean(isLoadingMessages);

	return (
		<Conversation
			className={className}
			aria-label="Conversation"
			aria-live="polite"
			aria-atomic={false}
		>
			<ConversationContent className={contentClassName}>
				{hasMessages ? (
					<>
						{messages.map((message) =>
							message.role === "user" ? (
								<article
									key={message.key ?? message.id}
									aria-label="Your message"
								>
									<UserMessage message={message} />
								</article>
							) : message.role === "assistant" ? (
								<article
									key={message.key ?? message.id}
									aria-label="AI response"
								>
									<AssistantMessage
										message={message}
										approvalsByToolCallId={approvalsByToolCallId}
									/>
								</article>
							) : null,
						)}
						{showInlineThinking && (
							<Message from="assistant">
								<MessageContent>
									<div className="flex items-center gap-1 py-1">
										<span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:0ms]" />
										<span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:150ms]" />
										<span className="size-1.5 animate-pulse rounded-full bg-muted-foreground/60 [animation-delay:300ms]" />
									</div>
								</MessageContent>
							</Message>
						)}
						{error && (
							<MessageErrorBubble
								error={error}
								onRetry={onRetry}
								retryState={retryState}
								retryCountdown={retryCountdown}
							/>
						)}
					</>
				) : showInitialLoading ? (
					<Message from="assistant">
						<MessageContent>
							<div className="flex items-center gap-2 text-sm text-muted-foreground">
								<Loader2 className="size-3.5 animate-spin" />
								<span>Loading messages...</span>
							</div>
						</MessageContent>
					</Message>
				) : (
					<ConversationEmptyState>
						{isIncognito ? (
							<IncognitoWelcomeScreen />
						) : (
							<div className="flex flex-col items-center gap-4 text-center">
								<PixelClaveIcon
									height={40}
									color="var(--color-sienna-500)"
									className="opacity-80"
								/>
								<div className="space-y-1">
									<h3 className="text-sm font-medium">How can I help?</h3>
									<p className="text-sm text-muted-foreground">
										Ask questions about your projects, create issues, search
										documents, and more.
									</p>
								</div>
								{onSuggestedPrompt && (
									<div className="mt-1 flex flex-wrap justify-center gap-2">
										{SUGGESTION_CHIPS.map((prompt) => (
											<SuggestionChip
												key={prompt}
												text={prompt}
												onClick={onSuggestedPrompt}
											/>
										))}
									</div>
								)}
							</div>
						)}
					</ConversationEmptyState>
				)}
			</ConversationContent>
			<ConversationScrollButton />
			{/* Screen reader announcement for streaming completion */}
			<div aria-live="assertive" aria-atomic className="sr-only">
				{streamingAnnouncement}
			</div>
		</Conversation>
	);
}
