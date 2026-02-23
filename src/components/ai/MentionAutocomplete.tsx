"use client";

import { Robot } from "@phosphor-icons/react/dist/ssr";
import type { FileUIPart } from "ai";
import { useQuery } from "convex/react";
import { CircleDot, FileText, Loader2, User } from "lucide-react";
import type { KeyboardEvent } from "react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { MentionChip } from "@/components/ai/MentionChip";
import type { SlashCommandAutocompleteProps } from "@/components/ai/SlashCommandAutocomplete";
import { SlashCommandAutocomplete } from "@/components/ai/SlashCommandAutocomplete";
import { VoiceButton } from "@/components/ai/voice-button";
import { useCurrentUser } from "@/components/providers/workspace-data-context";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Sheet,
	SheetContent,
	SheetHeader,
	SheetTitle,
} from "@/components/ui/sheet";
import type {
	MentionEntityType,
	MentionReference,
	MentionSearchResult,
} from "@/hooks/use-mention-search";
import { useMentionSearch } from "@/hooks/use-mention-search";
import { useIsMobile } from "@/hooks/use-mobile";
import {
	buildSlashCommandRegistry,
	type SlashCommand,
	type StoredSlashCommand,
} from "@/lib/ai/slash-commands";
import { cn } from "@/lib/utils";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

// ── Stable no-op for mobile Sheet props ────────────────────────────────
const NOOP = () => {};

// ── Types ────────────────────────────────────────────────────────────────

export type MentionAutocompleteProps = Omit<
	SlashCommandAutocompleteProps,
	"onSubmit"
> & {
	/** Workspace ID for mention search queries */
	workspaceId: Id<"workspaces">;
	/** Called when the user submits (includes mention references) */
	onSubmit: (
		text: string,
		systemPromptSuffix?: string,
		mentions?: MentionReference[],
		files?: FileUIPart[],
	) => void;
};

// ── Section labels and icons ─────────────────────────────────────────────

const SECTION_CONFIG: Record<
	MentionEntityType,
	{ label: string; icon: typeof User }
> = {
	user: { label: "Members", icon: User },
	issue: { label: "Issues", icon: CircleDot },
	document: { label: "Documents", icon: FileText },
	agent: { label: "AI Agents", icon: Robot as unknown as typeof User },
};

// ── Mention Result Item ──────────────────────────────────────────────────

const MentionResultItem = memo(function MentionResultItem({
	result,
	isActive,
	onSelect,
	onHover,
}: {
	result: MentionSearchResult;
	isActive: boolean;
	onSelect: (result: MentionSearchResult) => void;
	onHover: () => void;
}) {
	return (
		<button
			type="button"
			id={`mention-${result.entityType}-${result.entityId}`}
			role="option"
			aria-selected={isActive}
			className={cn(
				"flex w-full items-center gap-2.5 rounded-md px-3 py-1.5 text-left text-sm transition-colors",
				isActive
					? "bg-accent text-accent-foreground"
					: "text-foreground hover:bg-accent/50",
			)}
			onMouseDown={(e) => {
				e.preventDefault();
				onSelect(result);
			}}
			onMouseEnter={onHover}
		>
			{result.entityType === "user" && (
				<Avatar size="sm" className="size-5">
					{result.image && (
						<AvatarImage src={result.image} alt={result.displayName} />
					)}
					<AvatarFallback className="text-[9px]">
						{result.displayName.charAt(0).toUpperCase()}
					</AvatarFallback>
				</Avatar>
			)}
			{result.entityType === "issue" && (
				<CircleDot className="size-4 shrink-0 text-blue-500" />
			)}
			{result.entityType === "document" && (
				<FileText className="size-4 shrink-0 text-purple-500" />
			)}
			{result.entityType === "agent" && (
				<Robot className="size-4 shrink-0 text-emerald-500" />
			)}
			<div className="min-w-0 flex-1">
				<span className="truncate font-medium">{result.displayName}</span>
				{result.subtitle && (
					<span className="ml-2 text-xs text-muted-foreground">
						{result.subtitle}
					</span>
				)}
			</div>
		</button>
	);
});

// ── Section Group ────────────────────────────────────────────────────────

function SectionGroup({
	entityType,
	results,
	activeIndex,
	globalStartIndex,
	onSelect,
	onHover,
}: {
	entityType: MentionEntityType;
	results: MentionSearchResult[];
	activeIndex: number;
	globalStartIndex: number;
	onSelect: (result: MentionSearchResult) => void;
	onHover: (index: number) => void;
}) {
	const config = SECTION_CONFIG[entityType];
	const Icon = config.icon;

	return (
		<div>
			<div className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground">
				<Icon className="size-3" />
				{config.label}
			</div>
			{results.map((result, i) => (
				<MentionResultItem
					key={`${result.entityType}-${result.entityId}`}
					result={result}
					isActive={activeIndex === globalStartIndex + i}
					onSelect={onSelect}
					onHover={() => onHover(globalStartIndex + i)}
				/>
			))}
		</div>
	);
}

// ── Helper: extract @mention query from input ────────────────────────────

function extractMentionQuery(value: string): {
	query: string;
	startIndex: number;
} | null {
	// Find the last "@" that isn't preceded by a non-space character
	// (to avoid matching email addresses)
	for (let i = value.length - 1; i >= 0; i--) {
		if (value[i] === "@") {
			// Ensure @ is at start or preceded by whitespace
			if (i === 0 || /\s/.test(value[i - 1])) {
				const afterAt = value.slice(i + 1);
				// If there's a space in the query, user has moved on
				if (afterAt.includes(" ")) return null;
				return { query: afterAt, startIndex: i };
			}
		}
	}
	return null;
}

// ── MentionAutocomplete ──────────────────────────────────────────────────

export const MentionAutocomplete = memo(function MentionAutocomplete({
	workspaceId,
	onSubmit,
	...slashProps
}: MentionAutocompleteProps) {
	const workspaceSettings = useQuery(api.workspaceSettings.get, {
		workspaceId,
	});
	const currentUser = useCurrentUser();
	const [mentions, setMentions] = useState<MentionReference[]>([]);
	const [mentionDropdownOpen, setMentionDropdownOpen] = useState(false);
	const [activeIndex, setActiveIndex] = useState(0);
	const [inputValue, setInputValue] = useState("");
	const dropdownRef = useRef<HTMLDivElement>(null);
	const containerRef = useRef<HTMLDivElement>(null);
	const isMobile = useIsMobile();

	// Mobile Sheet: independent search query for mention filtering
	const [mobileMentionSearch, setMobileMentionSearch] = useState("");
	const commands = useMemo(() => {
		const workspaceCommands = ((
			workspaceSettings as
				| { workspaceSlashCommands?: StoredSlashCommand[] }
				| undefined
		)?.workspaceSlashCommands ?? []) as StoredSlashCommand[];
		const personalCommands = ((
			currentUser as { personalSlashCommands?: StoredSlashCommand[] } | null
		)?.personalSlashCommands ?? []) as StoredSlashCommand[];
		return buildSlashCommandRegistry({
			workspaceCommands,
			personalCommands,
		});
	}, [workspaceSettings, currentUser]);

	// Detect @mention query from the current input
	const mentionParsed = useMemo(
		() => extractMentionQuery(inputValue),
		[inputValue],
	);
	const mentionQuery = mentionParsed?.query ?? null;

	// Search for mentionable entities
	// On mobile: use Sheet's own search input; on desktop: use textarea's @query
	const searchQuery = mentionDropdownOpen
		? isMobile
			? mobileMentionSearch
			: mentionQuery
		: null;

	const { results, isSearching } = useMentionSearch(workspaceId, searchQuery);

	// Group results by entity type (preserving order: users, issues, documents)
	const groupedResults = useMemo(() => {
		const groups = new Map<MentionEntityType, MentionSearchResult[]>();
		const order: MentionEntityType[] = ["agent", "user", "issue", "document"];
		for (const type of order) {
			const items = results.filter((r) => r.entityType === type);
			if (items.length > 0) {
				groups.set(type, items);
			}
		}
		return groups;
	}, [results]);

	// Flat list for keyboard navigation
	const flatResults = useMemo(() => {
		const flat: MentionSearchResult[] = [];
		for (const items of groupedResults.values()) {
			flat.push(...items);
		}
		return flat;
	}, [groupedResults]);

	// Open/close dropdown based on @ detection
	useEffect(() => {
		// Only open if we detect an @ pattern and input doesn't start with "/"
		if (mentionParsed && !inputValue.startsWith("/")) {
			setMentionDropdownOpen(true);
		} else {
			setMentionDropdownOpen(false);
		}
	}, [mentionParsed, inputValue]);

	// Reset mobile search and seed from textarea query when Sheet opens
	useEffect(() => {
		if (isMobile && mentionDropdownOpen) {
			setMobileMentionSearch(mentionParsed?.query ?? "");
		} else if (!mentionDropdownOpen) {
			setMobileMentionSearch("");
		}
	}, [isMobile, mentionDropdownOpen, mentionParsed?.query]);

	// Reset active index when results change
	// biome-ignore lint/correctness/useExhaustiveDependencies: results.length triggers index reset
	useEffect(() => {
		setActiveIndex(0);
	}, [results.length]);

	// Close on click outside (desktop only)
	useEffect(() => {
		if (!mentionDropdownOpen || isMobile) return;

		function handleMouseDown(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				setMentionDropdownOpen(false);
			}
		}

		document.addEventListener("mousedown", handleMouseDown);
		return () => document.removeEventListener("mousedown", handleMouseDown);
	}, [mentionDropdownOpen, isMobile]);

	// Handle mention selection
	const handleMentionSelect = useCallback(
		(result: MentionSearchResult) => {
			if (!mentionParsed) return;

			// Replace @query with @DisplayName in the input text
			const before = inputValue.slice(0, mentionParsed.startIndex);
			const displayText =
				result.entityType === "issue" && result.subtitle
					? `@${result.subtitle}`
					: `@${result.displayName}`;
			const newValue = `${before}${displayText} `;
			setInputValue(newValue);

			// Add to mentions array
			const newMention: MentionReference = {
				entityType: result.entityType,
				entityId: result.entityId,
				displayName: result.displayName,
				metadata: {
					...(result.image ? { image: result.image } : {}),
					...(result.subtitle ? { subtitle: result.subtitle } : {}),
				},
			};
			setMentions((prev) => {
				// Don't add duplicate
				if (prev.some((m) => m.entityId === newMention.entityId)) return prev;
				return [...prev, newMention];
			});

			setMentionDropdownOpen(false);
		},
		[inputValue, mentionParsed],
	);

	// Handle hover
	const handleHover = useCallback((index: number) => {
		setActiveIndex(index);
	}, []);

	// Remove a mention chip
	const handleRemoveMention = useCallback((entityId: string) => {
		setMentions((prev) => prev.filter((m) => m.entityId !== entityId));
		// Also remove the @text from input if still present
		// This is best-effort — if user edited text, the @mention text may have moved
	}, []);

	// Handle submit — forward mentions along with text
	const handleSubmit = useCallback(
		(
			message: { text: string; files: FileUIPart[] },
			systemPromptSuffix?: string,
		) => {
			onSubmit(
				message.text,
				systemPromptSuffix,
				mentions.length > 0 ? mentions : undefined,
				message.files,
			);
			setMentions([]);
			setInputValue("");
		},
		[onSubmit, mentions],
	);

	// Keyboard navigation for mention dropdown (desktop only)
	const handleKeyDown = useCallback(
		(e: KeyboardEvent<HTMLTextAreaElement>) => {
			if (!mentionDropdownOpen || flatResults.length === 0) return;

			switch (e.key) {
				case "ArrowDown": {
					e.preventDefault();
					setActiveIndex((prev) =>
						prev < flatResults.length - 1 ? prev + 1 : 0,
					);
					break;
				}
				case "ArrowUp": {
					e.preventDefault();
					setActiveIndex((prev) =>
						prev > 0 ? prev - 1 : flatResults.length - 1,
					);
					break;
				}
				case "Enter":
				case "Tab": {
					if (flatResults[activeIndex]) {
						e.preventDefault();
						handleMentionSelect(flatResults[activeIndex]);
					}
					break;
				}
				case "Escape": {
					e.preventDefault();
					setMentionDropdownOpen(false);
					break;
				}
			}
		},
		[mentionDropdownOpen, flatResults, activeIndex, handleMentionSelect],
	);

	// Scroll active item into view (desktop only)
	// biome-ignore lint/correctness/useExhaustiveDependencies: activeIndex triggers scroll
	useEffect(() => {
		if (!mentionDropdownOpen || isMobile || !dropdownRef.current) return;
		const active = dropdownRef.current.querySelector('[aria-selected="true"]');
		active?.scrollIntoView({ block: "nearest" });
	}, [mentionDropdownOpen, isMobile, activeIndex]);

	// Handle input value changes — we intercept to manage mention state
	const handleValueChange = useCallback((value: string) => {
		setInputValue(value);
	}, []);

	// Voice transcription — inject transcript text into the input
	const handleTranscript = useCallback((text: string) => {
		setInputValue((prev) => (prev ? `${prev} ${text}` : text));
	}, []);

	const handleClientCommand = useCallback((command: SlashCommand) => {
		if (command.clientAction === "toggle_dictation") {
			window.dispatchEvent(
				new CustomEvent("clave:dictation-toggle", {
					detail: { source: "slash-command", surface: "ai-chat" },
				}),
			);
		}
	}, []);

	const voiceButton = useMemo(
		() => (
			<VoiceButton workspaceId={workspaceId} onTranscript={handleTranscript} />
		),
		[workspaceId, handleTranscript],
	);

	// Build global index mapping for section groups
	let globalIndex = 0;

	return (
		<div
			ref={containerRef}
			className="relative"
			role="combobox"
			aria-expanded={mentionDropdownOpen}
			aria-haspopup="listbox"
			aria-owns={
				mentionDropdownOpen && !isMobile ? "mention-listbox" : undefined
			}
			tabIndex={-1}
		>
			{/* Mention chips bar — show above input when there are active mentions */}
			{mentions.length > 0 && (
				<div className="flex flex-wrap gap-1 px-3 pb-1.5 pt-1">
					{mentions.map((mention) => (
						<MentionChip
							key={mention.entityId}
							entityType={mention.entityType}
							displayName={mention.displayName}
							image={mention.metadata?.image}
							subtitle={mention.metadata?.subtitle}
							onRemove={() => handleRemoveMention(mention.entityId)}
						/>
					))}
				</div>
			)}

			{/* Mobile bottom sheet — slides up when "@" is typed */}
			{isMobile && (
				<Sheet open={mentionDropdownOpen} onOpenChange={setMentionDropdownOpen}>
					<SheetContent
						side="bottom"
						className="flex h-[60vh] flex-col gap-0 p-0"
					>
						<SheetHeader className="shrink-0 px-4 py-3">
							<SheetTitle>Mention</SheetTitle>
						</SheetHeader>
						<div className="shrink-0 px-4 pb-3">
							<input
								type="search"
								placeholder="Search agents, people, issues, docs..."
								value={mobileMentionSearch}
								// biome-ignore lint/a11y/noAutofocus: intentional focus for mobile UX
								autoFocus
								onChange={(e) => setMobileMentionSearch(e.target.value)}
								className="w-full rounded-md border bg-background px-3 py-2 text-sm outline-none placeholder:text-muted-foreground focus:ring-2 focus:ring-ring"
							/>
						</div>
						<div className="flex-1 overflow-y-auto px-2 pb-4">
							{isSearching && results.length === 0 ? (
								<div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
									<Loader2 className="size-4 animate-spin" />
									Searching...
								</div>
							) : results.length > 0 ? (
								Array.from(groupedResults.entries()).map(
									([entityType, sectionResults]) => (
										<SectionGroup
											key={entityType}
											entityType={entityType}
											results={sectionResults}
											activeIndex={-1}
											globalStartIndex={0}
											onSelect={handleMentionSelect}
											onHover={NOOP}
										/>
									),
								)
							) : (
								<p className="py-8 text-center text-sm text-muted-foreground">
									No results for &ldquo;{mobileMentionSearch}&rdquo;
								</p>
							)}
						</div>
					</SheetContent>
				</Sheet>
			)}

			{/* Desktop mention dropdown — positioned above input */}
			{!isMobile &&
				mentionDropdownOpen &&
				(results.length > 0 || isSearching) && (
					<div
						ref={dropdownRef}
						id="mention-listbox"
						role="listbox"
						aria-label="Mention suggestions"
						className="absolute bottom-full left-3 right-3 z-50 mb-2 max-h-64 overflow-y-auto rounded-lg border bg-popover p-1 shadow-lg"
					>
						{isSearching && results.length === 0 ? (
							<div className="flex items-center justify-center gap-2 py-4 text-sm text-muted-foreground">
								<Loader2 className="size-4 animate-spin" />
								Searching...
							</div>
						) : (
							Array.from(groupedResults.entries()).map(
								([entityType, sectionResults]) => {
									const startIndex = globalIndex;
									globalIndex += sectionResults.length;
									return (
										<SectionGroup
											key={entityType}
											entityType={entityType}
											results={sectionResults}
											activeIndex={activeIndex}
											globalStartIndex={startIndex}
											onSelect={handleMentionSelect}
											onHover={handleHover}
										/>
									);
								},
							)
						)}
					</div>
				)}

			{/* Wrapped SlashCommandAutocomplete */}
			<SlashCommandAutocomplete
				{...slashProps}
				onSubmit={handleSubmit}
				value={inputValue}
				onValueChange={handleValueChange}
				onKeyDown={handleKeyDown}
				onClientCommand={handleClientCommand}
				commands={commands}
				beforeSubmit={voiceButton}
			/>
		</div>
	);
});
