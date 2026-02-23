"use client";

import type { KeyboardEvent } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
	ChatInputMessage,
	ChatInputProps,
} from "@/components/ai/shared/ChatInput";
import { ChatInput } from "@/components/ai/shared/ChatInput";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	BUILT_IN_SLASH_COMMANDS,
	buildHelpPrompt,
	CATEGORY_LABELS,
	filterCommands,
	groupCommandsByCategory,
	parseSlashInput,
	type SlashCommand,
	type SlashCommandCategory,
	type WorkspaceContext,
} from "@/lib/ai/slash-commands";
import { cn } from "@/lib/utils";

// ── Stable no-op for mobile Sheet props ────────────────────────────────
const NOOP = () => {};

// ── Types ────────────────────────────────────────────────────────────────

export type SlashCommandAutocompleteProps = Omit<
	ChatInputProps,
	"onSubmit" | "value" | "onValueChange" | "onKeyDown"
> & {
	/** Called when the user submits (handles slash command resolution) */
	onSubmit: (message: ChatInputMessage, systemPromptSuffix?: string) => void;
	/** Optional workspace context passed to command buildPrompt/buildSystemSuffix */
	context?: WorkspaceContext;
	/** Controlled input value (enables external state management by MentionAutocomplete) */
	value?: string;
	/** Called when the input value changes (for controlled mode) */
	onValueChange?: (value: string) => void;
	/** Optional callback for client-side slash commands (e.g. /dictate). */
	onClientCommand?: (command: SlashCommand) => void;
	/** External keyboard handler — called before internal slash command keyboard nav */
	onKeyDown?: (e: KeyboardEvent<HTMLTextAreaElement>) => void;
	/** Slash command registry (built-ins + custom commands). */
	commands?: SlashCommand[];
};

// ── Command Item ─────────────────────────────────────────────────────────

const CommandItem = memo(function CommandItem({
	command,
	isActive,
	onSelect,
	onHover,
}: {
	command: SlashCommand;
	isActive: boolean;
	onSelect: (command: SlashCommand) => void;
	onHover: () => void;
}) {
	const Icon = command.icon;
	return (
		<button
			type="button"
			id={`slash-cmd-${command.name}`}
			role="option"
			aria-selected={isActive}
			className={cn(
				"flex w-full items-center gap-3 rounded-md px-3 py-2 text-left text-sm transition-colors",
				isActive
					? "bg-accent text-accent-foreground"
					: "text-foreground hover:bg-accent/50",
			)}
			onMouseDown={(e) => {
				e.preventDefault();
				onSelect(command);
			}}
			onMouseEnter={onHover}
		>
			<Icon className="size-4 shrink-0 text-muted-foreground" />
			<div className="min-w-0 flex-1">
				<span className="font-medium">{command.displayName}</span>
				<span className="ml-2 text-muted-foreground">
					{command.description}
				</span>
			</div>
		</button>
	);
});

// ── Category Group ───────────────────────────────────────────────────────

function CategoryGroup({
	category,
	commands,
	activeIndex,
	globalStartIndex,
	onSelect,
	onHover,
}: {
	category: SlashCommandCategory;
	commands: SlashCommand[];
	activeIndex: number;
	globalStartIndex: number;
	onSelect: (command: SlashCommand) => void;
	onHover: (index: number) => void;
}) {
	return (
		<div>
			<div className="px-3 py-1.5 text-xs font-medium text-muted-foreground">
				{CATEGORY_LABELS[category]}
			</div>
			{commands.map((cmd, i) => (
				<CommandItem
					key={cmd.name}
					command={cmd}
					isActive={activeIndex === globalStartIndex + i}
					onSelect={onSelect}
					onHover={() => onHover(globalStartIndex + i)}
				/>
			))}
		</div>
	);
}

// ── SlashCommandAutocomplete ─────────────────────────────────────────────

export const SlashCommandAutocomplete = memo(function SlashCommandAutocomplete({
	onSubmit,
	context,
	value: controlledValue,
	onValueChange: controlledOnValueChange,
	onClientCommand,
	onKeyDown: externalOnKeyDown,
	commands: registryCommands,
	...chatInputProps
}: SlashCommandAutocompleteProps) {
	const [internalValue, setInternalValue] = useState("");
	const isControlled = controlledValue !== undefined;
	const inputValue = isControlled ? controlledValue : internalValue;
	const [isOpen, setIsOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const dropdownRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const isMobile = useIsMobile();

	// Mobile Sheet search state (independent of textarea value)
	const [mobileSearch, setMobileSearch] = useState("");

	// Determine if input looks like a slash command query
	const slashQuery = useMemo(() => {
		if (!inputValue.startsWith("/")) return null;
		// Extract query after "/" — stop at first space (command name only)
		const afterSlash = inputValue.slice(1);
		const spaceIdx = afterSlash.indexOf(" ");
		// If there's a space, the user has moved past command selection
		if (spaceIdx !== -1) return null;
		return afterSlash;
	}, [inputValue]);

	// Filter commands based on the query
	const availableCommands = useMemo(() => {
		if (registryCommands && registryCommands.length > 0)
			return registryCommands;
		return BUILT_IN_SLASH_COMMANDS;
	}, [registryCommands]);
	const filteredCommands = useMemo(
		() =>
			slashQuery !== null ? filterCommands(slashQuery, availableCommands) : [],
		[slashQuery, availableCommands],
	);

	// Group filtered commands by category
	const groupedCommands = useMemo(
		() => groupCommandsByCategory(filteredCommands),
		[filteredCommands],
	);

	// Build a flat list for keyboard navigation indexing
	const flatCommands = useMemo(() => {
		const flat: SlashCommand[] = [];
		for (const commands of groupedCommands.values()) {
			flat.push(...commands);
		}
		return flat;
	}, [groupedCommands]);

	// Mobile Sheet: filtered commands based on Sheet search input
	const mobileFilteredCommands = useMemo(
		() => filterCommands(mobileSearch, availableCommands),
		[mobileSearch, availableCommands],
	);
	const mobileGroupedCommands = useMemo(
		() => groupCommandsByCategory(mobileFilteredCommands),
		[mobileFilteredCommands],
	);

	// Open/close dropdown based on slash detection
	useEffect(() => {
		if (slashQuery !== null && filteredCommands.length > 0) {
			setIsOpen(true);
		} else {
			setIsOpen(false);
		}
	}, [slashQuery, filteredCommands.length]);

	// Reset mobile search when Sheet closes
	useEffect(() => {
		if (!isOpen) setMobileSearch("");
	}, [isOpen]);

	// Reset active index when filtered results change
	// biome-ignore lint/correctness/useExhaustiveDependencies: filteredCommands.length is an intentional trigger to reset index when results change
	useEffect(() => {
		setActiveIndex(0);
	}, [filteredCommands.length]);

	// Close on click outside (desktop only)
	useEffect(() => {
		if (!isOpen || isMobile) return;

		function handleMouseDown(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setIsOpen(false);
			}
		}

		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, [isOpen, isMobile]);

	// Helper to set input value (controlled or uncontrolled)
	const setInput = useCallback(
		(value: string) => {
			if (isControlled) {
				controlledOnValueChange?.(value);
			} else {
				setInternalValue(value);
			}
		},
		[isControlled, controlledOnValueChange],
	);

	// Handle command selection
	const handleSelect = useCallback(
		(command: SlashCommand) => {
			const hasRequiredArgs = command.args?.some((a) => a.required);
			if (hasRequiredArgs) {
				setInput(`/${command.name} `);
			} else {
				setInput(`/${command.name}`);
			}
			setIsOpen(false);
		},
		[setInput],
	);

	// Handle hover on command items
	const handleHover = useCallback((index: number) => {
		setActiveIndex(index);
	}, []);

	// Handle input value changes
	const handleValueChange = useCallback(
		(value: string) => {
			setInput(value);
		},
		[setInput],
	);

	// Handle submit — resolve slash commands
	const handleSubmit = useCallback(
		(message: ChatInputMessage) => {
			const text = message.text;
			const parsed = parseSlashInput(text, availableCommands);
			if (parsed) {
				if (parsed.command.clientAction) {
					onClientCommand?.(parsed.command);
					setInput("");
					setIsOpen(false);
					return;
				}
				const prompt =
					parsed.command.name === "help"
						? buildHelpPrompt(availableCommands)
						: parsed.command.buildPrompt(parsed.args || undefined, context);
				const suffix = parsed.command.buildSystemSuffix?.(
					parsed.args || undefined,
					context,
				);
				onSubmit({ ...message, text: prompt }, suffix);
			} else {
				onSubmit(message);
			}
			setInput("");
			setIsOpen(false);
		},
		[onSubmit, context, onClientCommand, setInput, availableCommands],
	);

	// Keyboard navigation — external handler runs first (e.g. MentionAutocomplete)
	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			// Let external handler (e.g. MentionAutocomplete) handle first
			externalOnKeyDown?.(e);
			if (e.defaultPrevented) return;

			if (!isOpen) return;

			switch (e.key) {
				case "ArrowDown": {
					e.preventDefault();
					setActiveIndex((prev) =>
						prev < flatCommands.length - 1 ? prev + 1 : 0,
					);
					break;
				}
				case "ArrowUp": {
					e.preventDefault();
					setActiveIndex((prev) =>
						prev > 0 ? prev - 1 : flatCommands.length - 1,
					);
					break;
				}
				case "Enter":
				case "Tab": {
					if (flatCommands[activeIndex]) {
						e.preventDefault();
						handleSelect(flatCommands[activeIndex]);
					}
					break;
				}
				case "Escape": {
					e.preventDefault();
					setIsOpen(false);
					break;
				}
			}
		},
		[isOpen, flatCommands, activeIndex, handleSelect, externalOnKeyDown],
	);

	// Scroll active item into view (desktop only)
	// biome-ignore lint/correctness/useExhaustiveDependencies: activeIndex is an intentional trigger to scroll the newly highlighted item into view
	useEffect(() => {
		if (!isOpen || isMobile || !dropdownRef.current) return;
		const active = dropdownRef.current.querySelector('[aria-selected="true"]');
		active?.scrollIntoView({ block: "nearest" });
	}, [isOpen, isMobile, activeIndex]);

	// Build global index mapping for category groups
	let globalIndex = 0;

	return (
		<div
			ref={containerRef}
			className="relative"
			role="combobox"
			aria-expanded={isOpen}
			aria-haspopup="listbox"
			aria-owns={isOpen && !isMobile ? "slash-command-listbox" : undefined}
			tabIndex={-1}
		>
			{/* Mobile bottom sheet — slides up when "/" is typed */}
			{isMobile && (
				<Sheet open={isOpen} onOpenChange={setIsOpen}>
					<SheetContent
						side="bottom"
						className="flex h-[60vh] flex-col gap-0 p-0"
					>
						<SheetHeader className="shrink-0 px-4 py-3">
							<SheetTitle>Commands</SheetTitle>
						</SheetHeader>
						<div className="shrink-0 px-4 pb-3">
							<input
								type="search"
								placeholder="Search commands..."
								value={mobileSearch}
								// biome-ignore lint/a11y/noAutofocus: intentional focus for mobile UX
								autoFocus
								onChange={(e) => setMobileSearch(e.target.value)}
								className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
							/>
						</div>
						<div className="flex-1 overflow-y-auto px-2 pb-4">
							{Array.from(mobileGroupedCommands.entries()).map(
								([category, commands]) => (
									<CategoryGroup
										key={category}
										category={category}
										commands={commands}
										activeIndex={-1}
										globalStartIndex={0}
										onSelect={handleSelect}
										onHover={NOOP}
									/>
								),
							)}
							{mobileFilteredCommands.length === 0 && (
								<p className="py-8 text-center text-sm text-muted-foreground">
									No commands match &ldquo;{mobileSearch}&rdquo;
								</p>
							)}
						</div>
					</SheetContent>
				</Sheet>
			)}

			{/* Desktop command dropdown — positioned above input */}
			{!isMobile && isOpen && filteredCommands.length > 0 && (
				<div
					ref={dropdownRef}
					id="slash-command-listbox"
					role="listbox"
					aria-label="Slash commands"
					className="absolute bottom-full left-3 right-3 z-50 mb-2 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
				>
					{Array.from(groupedCommands.entries()).map(([category, commands]) => {
						const startIndex = globalIndex;
						globalIndex += commands.length;
						return (
							<CategoryGroup
								key={category}
								category={category}
								commands={commands}
								activeIndex={activeIndex}
								globalStartIndex={startIndex}
								onSelect={handleSelect}
								onHover={handleHover}
							/>
						);
					})}
				</div>
			)}

			{/* Wrapped ChatInput with controlled value */}
			<ChatInput
				{...chatInputProps}
				onSubmit={handleSubmit}
				value={inputValue}
				onValueChange={handleValueChange}
				onKeyDown={handleKeyDown}
			/>
		</div>
	);
});
