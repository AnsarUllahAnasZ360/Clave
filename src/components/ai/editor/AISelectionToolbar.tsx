"use client";

/**
 * Floating AI selection toolbar.
 *
 * Appears when the user selects text in a supported editor. Offers
 * six AI actions: Improve, Rewrite, Summarize, Translate, Fix Grammar,
 * and Expand. Results are displayed inline via `AIResponseInline`.
 *
 * Rendered as a portal with `position: fixed` to avoid z-index issues
 * with editor containers. Must NOT appear in share mode (public views).
 */

import {
	BookOpenIcon,
	GlobeIcon,
	ListPlusIcon,
	MoreVerticalIcon,
	SparklesIcon,
	SpellCheckIcon,
	WandIcon,
	XIcon,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AIResponseInline } from "@/components/ai/AIResponseInline";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EmbeddedAIActionType } from "@/types/embedded-ai";
import type { EditorAIContext } from "./AIEditorActions";
import type { AIEditorAdapter } from "./AIEditorAdapter";
import { LANGUAGES } from "./languages";

// ── Types ───────────────────────────────────────────────────────────────────

interface AISelectionToolbarProps {
	/** Whether the toolbar is visible. */
	visible: boolean;
	/** Screen position (from use-ai-selection-toolbar hook). */
	position: { x: number; y: number } | null;
	/** The selected text. */
	selectedText: string | null;
	/** The editor adapter for content operations. */
	adapter: AIEditorAdapter | null;
	/** Context for the embedded AI action. */
	context: EditorAIContext;
	/** Dismiss callback. */
	onDismiss: () => void;
	/** Callback to trigger an AI action. Returns the result text. */
	onAction: (
		actionType: EmbeddedAIActionType,
		selectedText: string,
		targetLanguage?: string,
	) => Promise<string | null>;
}

interface ToolbarAction {
	type: EmbeddedAIActionType;
	label: string;
	icon: React.ReactNode;
	shortLabel: string;
}

// ── Action Definitions ──────────────────────────────────────────────────────

const PRIMARY_ACTIONS: ToolbarAction[] = [
	{
		type: "document_improve",
		label: "Improve",
		shortLabel: "Improve",
		icon: <WandIcon className="size-3.5" />,
	},
	{
		type: "document_rewrite",
		label: "Rewrite",
		shortLabel: "Rewrite",
		icon: <SparklesIcon className="size-3.5" />,
	},
];

const SECONDARY_ACTIONS: ToolbarAction[] = [
	{
		type: "document_summarize",
		label: "Summarize",
		shortLabel: "Summarize",
		icon: <BookOpenIcon className="size-3.5" />,
	},
	{
		type: "document_translate",
		label: "Translate",
		shortLabel: "Translate",
		icon: <GlobeIcon className="size-3.5" />,
	},
	{
		type: "document_fix_grammar",
		label: "Fix Grammar",
		shortLabel: "Grammar",
		icon: <SpellCheckIcon className="size-3.5" />,
	},
	{
		type: "document_expand",
		label: "Expand",
		shortLabel: "Expand",
		icon: <ListPlusIcon className="size-3.5" />,
	},
];

const ALL_ACTIONS = [...PRIMARY_ACTIONS, ...SECONDARY_ACTIONS];

// LANGUAGES imported from ./languages

// ── Component ───────────────────────────────────────────────────────────────

export function AISelectionToolbar(_props: AISelectionToolbarProps) {
	return null;
}

function _AISelectionToolbarLegacy({
	visible,
	position,
	selectedText,
	adapter,
	onDismiss,
	onAction,
}: AISelectionToolbarProps) {
	const [isLoading, setIsLoading] = useState(false);
	const [activeAction, setActiveAction] = useState<EmbeddedAIActionType | null>(
		null,
	);
	const [resultText, setResultText] = useState<string | null>(null);
	const [showLanguagePicker, setShowLanguagePicker] = useState(false);
	const [showMoreMenu, setShowMoreMenu] = useState(false);
	const menuRef = useRef<HTMLDivElement>(null);

	// Close menu when clicking outside
	useEffect(() => {
		if (!showMoreMenu) return;

		const handleClickOutside = (e: MouseEvent) => {
			if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
				setShowMoreMenu(false);
				setShowLanguagePicker(false);
			}
		};

		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [showMoreMenu]);

	const handleAction = useCallback(
		async (actionType: EmbeddedAIActionType, targetLanguage?: string) => {
			if (!selectedText || isLoading) return;

			setIsLoading(true);
			setActiveAction(actionType);
			setShowLanguagePicker(false);

			const result = await onAction(actionType, selectedText, targetLanguage);
			setResultText(result);
			setIsLoading(false);
		},
		[selectedText, isLoading, onAction],
	);

	const handleAccept = useCallback(() => {
		if (resultText && adapter) {
			adapter.replaceSelection(resultText);
		}
		setResultText(null);
		setActiveAction(null);
		onDismiss();
	}, [resultText, adapter, onDismiss]);

	const handleReject = useCallback(() => {
		setResultText(null);
		setActiveAction(null);
	}, []);

	if (!visible || !position) return null;

	const toolbar = (
		<div
			className="fixed z-[60] animate-in fade-in slide-in-from-bottom-1 duration-150 max-w-[calc(100vw-2rem)]"
			style={{
				left: position.x,
				top: position.y,
				transform: "translateX(-50%)",
			}}
		>
			{/* Result display (when AI has responded) */}
			{resultText && !isLoading && (
				<div className="mb-2 w-[min(320px,calc(100vw-2rem))]">
					<AIResponseInline
						text={resultText}
						isStreaming={false}
						onAccept={handleAccept}
						onReject={handleReject}
						label={
							activeAction
								? `AI ${ALL_ACTIONS.find((a) => a.type === activeAction)?.label ?? ""}`
								: undefined
						}
					/>
				</div>
			)}

			{/* Toolbar buttons - Primary actions + More menu */}
			<div
				ref={menuRef}
				className={cn(
					"flex items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-lg",
					"border-border/80 dark:border-border",
				)}
			>
				{/* Primary actions (Improve, Rewrite) */}
				{PRIMARY_ACTIONS.map((action) => (
					<Button
						key={action.type}
						variant="ghost"
						size="xs"
						className={cn(
							"gap-1 text-muted-foreground hover:text-foreground",
							activeAction === action.type && "text-sienna-500",
						)}
						onClick={() => handleAction(action.type)}
						disabled={isLoading}
					>
						{isLoading && activeAction === action.type ? (
							<span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
						) : (
							action.icon
						)}
						<span className="text-[11px]">{action.shortLabel}</span>
					</Button>
				))}

				{/* More actions dropdown menu */}
				<div className="relative">
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground hover:text-foreground"
						onClick={() => setShowMoreMenu(!showMoreMenu)}
						disabled={isLoading}
					>
						<MoreVerticalIcon className="size-4" />
					</Button>

					{/* Secondary actions dropdown */}
					{showMoreMenu && (
						<div className="absolute right-0 top-full mt-1 z-10 rounded-md border bg-popover shadow-lg min-w-[140px] overflow-hidden">
							{SECONDARY_ACTIONS.map((action) => {
								if (action.type === "document_translate") {
									return (
										<div key={action.type}>
											<button
												type="button"
												className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left hover:text-foreground text-muted-foreground"
												onClick={() => setShowLanguagePicker(true)}
											>
												{action.icon}
												<span>{action.label}</span>
											</button>

											{/* Language picker submenu */}
											{showLanguagePicker && (
												<div className="absolute left-full top-0 mt-0 z-10 rounded-md border bg-popover shadow-lg min-w-[120px] overflow-hidden">
													{LANGUAGES.map((lang) => (
														<button
															key={lang.code}
															type="button"
															className="flex w-full items-center gap-2 px-3 py-2 text-xs hover:bg-accent text-left hover:text-foreground text-muted-foreground"
															onClick={() => {
																handleAction(action.type, lang.label);
																setShowMoreMenu(false);
																setShowLanguagePicker(false);
															}}
														>
															{lang.label}
														</button>
													))}
												</div>
											)}
										</div>
									);
								}

								return (
									<button
										key={action.type}
										type="button"
										className={cn(
											"flex w-full items-center gap-2 px-3 py-2 text-xs text-muted-foreground hover:text-foreground hover:bg-accent",
											activeAction === action.type &&
												"text-sienna-500 bg-accent",
										)}
										onClick={() => {
											handleAction(action.type);
											setShowMoreMenu(false);
										}}
										disabled={isLoading}
									>
										{isLoading && activeAction === action.type ? (
											<span className="size-3.5 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
										) : (
											action.icon
										)}
										<span>{action.label}</span>
									</button>
								);
							})}
						</div>
					)}
				</div>

				{/* Dismiss button */}
				<div className="ml-0.5 border-l border-border/50 pl-0.5">
					<Button
						variant="ghost"
						size="icon-xs"
						className="text-muted-foreground hover:text-foreground"
						onClick={onDismiss}
					>
						<XIcon className="size-3" />
					</Button>
				</div>
			</div>

			{/* Loading indicator */}
			{isLoading && (
				<div className="mt-1 flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
					<span className="size-1.5 animate-pulse rounded-full bg-sienna-400" />
					<span>AI is thinking...</span>
				</div>
			)}
		</div>
	);

	// Render via portal to avoid z-index issues with editor containers.
	if (typeof document === "undefined") return null;
	return createPortal(toolbar, document.body);
}
