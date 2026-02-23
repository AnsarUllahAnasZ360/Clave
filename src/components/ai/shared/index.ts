// Shared AI chat component library
// These components are layout-agnostic and used by both the sidebar and full-page chat.

export type { ApprovalCardProps, ApprovalStatus } from "./ApprovalCard";
export { ApprovalCard } from "./ApprovalCard";
export type { ChatHeaderProps } from "./ChatHeader";
export { ChatHeader } from "./ChatHeader";
export type { ChatInputProps } from "./ChatInput";
export { ChatInput } from "./ChatInput";

export { ContextChip } from "./ContextChip";
export type { ConversationViewProps } from "./ConversationView";
export { ConversationView } from "./ConversationView";
export type { AssistantMessageProps, ToolApprovalData } from "./MessageItem";
export {
	AssistantAvatar,
	AssistantMessage,
	StreamingDots,
	UserMessage,
} from "./MessageItem";
export type { ModelSelectorProps } from "./ModelSelector";
export { ModelSelector } from "./ModelSelector";
