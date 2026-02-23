"use client";

import { Search } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
	ALL_SHORTCUTS,
	detectOS,
	type OperatingSystem,
	SHORTCUT_CATEGORIES,
	type ShortcutDefinition,
	useShortcuts,
} from "@/hooks/use-shortcuts";
import { cn } from "@/lib/utils";

// ── OS Detection Hook ────────────────────────────────────────────────────

function useOS(): OperatingSystem {
	const [os, setOS] = useState<OperatingSystem>("mac");
	useEffect(() => {
		setOS(detectOS());
	}, []);
	return os;
}

const OS_LABELS: Record<OperatingSystem, string> = {
	mac: "macOS",
	windows: "Windows",
	linux: "Linux",
};

// ── Formatting ───────────────────────────────────────────────────────────

function formatModifierForOS(
	modifier: string | undefined,
	os: OperatingSystem,
): string[] {
	if (!modifier) return [];

	if (os === "mac") {
		const map: Record<string, string> = {
			cmd: "\u2318",
			shift: "\u21E7",
			alt: "\u2325",
		};
		return modifier
			.split("+")
			.map((m) => map[m] ?? "")
			.filter(Boolean);
	}

	const map: Record<string, string> = {
		cmd: "Ctrl",
		shift: "Shift",
		alt: "Alt",
	};
	return modifier
		.split("+")
		.map((m) => map[m] ?? "")
		.filter(Boolean);
}

function formatKeyForOS(key: string, os: OperatingSystem): string {
	if (os !== "mac") {
		switch (key) {
			case "\u232B":
			case "\u2190":
				return "Bksp";
			case "⌫":
				return "Bksp";
			default:
				return key;
		}
	}
	return key;
}

// Shorter tab labels for tight horizontal space
const TAB_LABELS: Record<string, string> = {
	popular: "Popular",
	global: "Global",
	navigation: "Navigation",
	issue: "Issues",
	inbox: "Inbox",
	views: "Views",
	ai_chat: "AI Chat",
};

// ── Components ───────────────────────────────────────────────────────────

function Kbd({
	children,
	className,
	wide,
}: {
	children: React.ReactNode;
	className?: string;
	wide?: boolean;
}) {
	return (
		<kbd
			className={cn(
				"inline-flex h-6 items-center justify-center rounded-md border border-border/80 bg-muted/60 font-mono text-[11px] font-medium text-muted-foreground shadow-[0_1px_0_0_rgba(0,0,0,0.05)] dark:shadow-[0_1px_0_0_rgba(255,255,255,0.05)]",
				wide ? "min-w-7 px-1.5" : "min-w-6 px-1",
				className,
			)}
		>
			{children}
		</kbd>
	);
}

function ShortcutKeys({
	shortcut,
	os,
}: {
	shortcut: ShortcutDefinition;
	os: OperatingSystem;
}) {
	const mods = formatModifierForOS(shortcut.modifier, os);
	const keys = shortcut.key.split(" ");
	const isMac = os === "mac";

	return (
		<span className="flex items-center gap-1 shrink-0">
			{mods.map((mod) => (
				<Kbd key={mod} wide={!isMac}>
					{mod}
				</Kbd>
			))}
			{mods.length > 0 && !isMac && keys.length === 1 && (
				<span className="text-[10px] text-muted-foreground/40 select-none">
					+
				</span>
			)}
			{(() => {
				let keyOccurrences = 0;
				return keys.map((k, i) => {
					keyOccurrences += 1;
					return (
						<span
							key={`${k}-${keyOccurrences}`}
							className="flex items-center gap-1"
						>
							{i > 0 && (
								<span className="text-[10px] text-muted-foreground/40 select-none">
									then
								</span>
							)}
							<Kbd>{formatKeyForOS(k, os)}</Kbd>
						</span>
					);
				});
			})()}
		</span>
	);
}

function ShortcutRow({
	shortcut,
	os,
}: {
	shortcut: ShortcutDefinition;
	os: OperatingSystem;
}) {
	return (
		<div className="group flex items-center justify-between gap-4 py-2 px-3 rounded-lg hover:bg-accent/50 transition-colors">
			<span className="text-[13px] text-foreground/90 group-hover:text-foreground transition-colors">
				{shortcut.label}
			</span>
			<ShortcutKeys shortcut={shortcut} os={os} />
		</div>
	);
}

function ShortcutGroup({
	label,
	shortcuts,
	os,
}: {
	label: string;
	shortcuts: ShortcutDefinition[];
	os: OperatingSystem;
}) {
	if (shortcuts.length === 0) return null;
	return (
		<div>
			<h3 className="mb-1 text-[11px] font-semibold text-muted-foreground/70 uppercase tracking-wider px-3">
				{label}
			</h3>
			<div>
				{shortcuts.map((shortcut, i) => (
					<ShortcutRow
						key={`${shortcut.category}-${shortcut.key}-${shortcut.modifier ?? "none"}-${i}`}
						shortcut={shortcut}
						os={os}
					/>
				))}
			</div>
		</div>
	);
}

function ShortcutList({
	shortcuts,
	os,
}: {
	shortcuts: ShortcutDefinition[];
	os: OperatingSystem;
}) {
	if (shortcuts.length === 0) {
		return (
			<div className="flex items-center justify-center py-12 text-sm text-muted-foreground/60">
				No shortcuts in this category
			</div>
		);
	}

	return (
		<div>
			{shortcuts.map((shortcut, i) => (
				<ShortcutRow
					key={`${shortcut.category}-${shortcut.key}-${shortcut.modifier ?? "none"}-${i}`}
					shortcut={shortcut}
					os={os}
				/>
			))}
		</div>
	);
}

function SearchResults({
	shortcuts,
	os,
	search,
}: {
	shortcuts: ShortcutDefinition[];
	os: OperatingSystem;
	search: string;
}) {
	const categorizedShortcuts = SHORTCUT_CATEGORIES.map((cat) => ({
		...cat,
		shortcuts: shortcuts.filter((s) => s.category === cat.id),
	})).filter((cat) => cat.shortcuts.length > 0);

	if (categorizedShortcuts.length === 0) {
		return (
			<div className="flex flex-col items-center justify-center py-12 gap-2">
				<span className="text-sm text-muted-foreground/60">
					No shortcuts found for &ldquo;{search}&rdquo;
				</span>
				<span className="text-xs text-muted-foreground/40">
					Try a different search term
				</span>
			</div>
		);
	}

	return (
		<div className="space-y-5">
			{categorizedShortcuts.map((cat) => (
				<ShortcutGroup
					key={cat.id}
					label={cat.label}
					shortcuts={cat.shortcuts}
					os={os}
				/>
			))}
		</div>
	);
}

// ── Footer ───────────────────────────────────────────────────────────────

function ShortcutFooter({ count, os }: { count: number; os: OperatingSystem }) {
	return (
		<div className="flex items-center justify-between px-6 py-3 border-t border-border/40 bg-muted/20">
			<span className="text-[11px] text-muted-foreground/50">
				{count} shortcut{count !== 1 ? "s" : ""}
			</span>
			<span className="text-[11px] text-muted-foreground/50">
				Showing {OS_LABELS[os]} keys
			</span>
		</div>
	);
}

// ── Main Overlay ─────────────────────────────────────────────────────────

export function ShortcutsHelpOverlay() {
	const { helpOpen, closeHelp } = useShortcuts();
	const os = useOS();
	const [search, setSearch] = useState("");
	const [activeTab, setActiveTab] = useState("popular");
	const searchRef = useRef<HTMLInputElement>(null);

	// Reset search when dialog opens
	useEffect(() => {
		if (helpOpen) {
			setSearch("");
			setTimeout(() => searchRef.current?.focus(), 150);
		}
	}, [helpOpen]);

	const filteredShortcuts = useMemo(() => {
		if (!search.trim()) return ALL_SHORTCUTS;
		const q = search.toLowerCase();
		return ALL_SHORTCUTS.filter(
			(s) =>
				s.label.toLowerCase().includes(q) || s.key.toLowerCase().includes(q),
		);
	}, [search]);

	const popularShortcuts = useMemo(
		() => filteredShortcuts.filter((s) => s.popular),
		[filteredShortcuts],
	);

	const categorizedShortcuts = useMemo(
		() =>
			SHORTCUT_CATEGORIES.map((cat) => ({
				...cat,
				shortcuts: filteredShortcuts.filter((s) => s.category === cat.id),
			})),
		[filteredShortcuts],
	);

	const isSearching = search.trim().length > 0;

	// Get count for the active tab
	const activeCount = useMemo(() => {
		if (isSearching) return filteredShortcuts.length;
		if (activeTab === "popular") return popularShortcuts.length;
		const cat = categorizedShortcuts.find((c) => c.id === activeTab);
		return cat?.shortcuts.length ?? 0;
	}, [
		isSearching,
		filteredShortcuts,
		activeTab,
		popularShortcuts,
		categorizedShortcuts,
	]);

	return (
		<Dialog open={helpOpen} onOpenChange={(open) => !open && closeHelp()}>
			<DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden flex flex-col max-h-[80vh]">
				{/* Header */}
				<div className="px-6 pt-6 pb-4 shrink-0">
					<DialogHeader>
						<DialogTitle className="text-lg font-semibold">
							Keyboard shortcuts
						</DialogTitle>
						<DialogDescription className="text-[13px] mt-1">
							Navigate and manage your workspace with keyboard shortcuts. Press{" "}
							<Kbd>?</Kbd> to toggle this dialog.
						</DialogDescription>
					</DialogHeader>

					{/* Search + OS indicator */}
					<div className="mt-4 flex items-center gap-3">
						<div className="relative flex-1">
							<Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
							<input
								ref={searchRef}
								type="text"
								placeholder="Search shortcuts..."
								value={search}
								onChange={(e) => setSearch(e.target.value)}
								className={cn(
									"w-full h-9 pl-9 pr-3 rounded-lg border border-border/60 bg-muted/30 text-sm",
									"placeholder:text-muted-foreground/40",
									"focus:outline-none focus:ring-2 focus:ring-ring/20 focus:border-ring/40",
									"transition-all duration-150",
								)}
							/>
						</div>
						<div className="flex items-center gap-1.5 text-[11px] text-muted-foreground/60 bg-muted/40 px-2.5 py-2 rounded-md border border-border/40 shrink-0">
							{os === "mac" && (
								<span className="text-sm leading-none">{"\u2318"}</span>
							)}
							<span>{OS_LABELS[os]}</span>
						</div>
					</div>
				</div>

				{/* Content */}
				{isSearching ? (
					<>
						<div className="flex-1 overflow-y-auto px-6 pb-4 min-h-0">
							<SearchResults
								shortcuts={filteredShortcuts}
								os={os}
								search={search}
							/>
						</div>
						<ShortcutFooter count={filteredShortcuts.length} os={os} />
					</>
				) : (
					<Tabs
						value={activeTab}
						onValueChange={setActiveTab}
						className="flex flex-col min-h-0 flex-1 gap-0"
					>
						<div className="shrink-0 border-b border-border/50 px-6">
							<TabsList
								variant="line"
								className="w-full justify-start -mb-px gap-0"
							>
								<TabsTrigger value="popular" className="text-xs px-3">
									{TAB_LABELS.popular}
								</TabsTrigger>
								{SHORTCUT_CATEGORIES.map((cat) => (
									<TabsTrigger
										key={cat.id}
										value={cat.id}
										className="text-xs px-3"
									>
										{TAB_LABELS[cat.id] ?? cat.label}
									</TabsTrigger>
								))}
							</TabsList>
						</div>

						<div className="flex-1 overflow-y-auto min-h-0">
							<div className="px-6 py-3">
								<TabsContent value="popular" className="mt-0">
									<ShortcutList shortcuts={popularShortcuts} os={os} />
								</TabsContent>

								{categorizedShortcuts.map((cat) => (
									<TabsContent key={cat.id} value={cat.id} className="mt-0">
										<ShortcutList shortcuts={cat.shortcuts} os={os} />
									</TabsContent>
								))}
							</div>
						</div>

						<ShortcutFooter count={activeCount} os={os} />
					</Tabs>
				)}
			</DialogContent>
		</Dialog>
	);
}
