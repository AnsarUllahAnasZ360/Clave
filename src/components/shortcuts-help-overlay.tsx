"use client";

import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	ALL_SHORTCUTS,
	SHORTCUT_CATEGORIES,
	type ShortcutCategory,
	type ShortcutDefinition,
	useShortcuts,
} from "@/hooks/use-shortcuts";
import { cn } from "@/lib/utils";

function formatModifier(modifier?: string): string {
	switch (modifier) {
		case "cmd":
			return "\u2318";
		case "shift":
			return "\u21E7";
		case "alt":
			return "\u2325";
		default:
			return "";
	}
}

function ShortcutKey({ shortcut }: { shortcut: ShortcutDefinition }) {
	const mod = formatModifier(shortcut.modifier);
	return (
		<span className="flex items-center gap-0.5">
			{mod && (
				<kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[11px] text-muted-foreground">
					{mod}
				</kbd>
			)}
			<kbd className="inline-flex h-5 min-w-5 items-center justify-center rounded border border-border bg-muted px-1 font-mono text-[11px] text-muted-foreground">
				{shortcut.key}
			</kbd>
		</span>
	);
}

function ShortcutSection({
	category,
	label,
	shortcuts,
}: {
	category: ShortcutCategory;
	label: string;
	shortcuts: ShortcutDefinition[];
}) {
	if (shortcuts.length === 0) return null;

	return (
		<div>
			<h3 className="mb-2 text-xs font-medium text-muted-foreground uppercase tracking-wider">
				{label}
			</h3>
			<div className="space-y-1">
				{shortcuts.map((shortcut, i) => (
					<div
						key={`${category}-${shortcut.key}-${shortcut.modifier ?? "none"}-${i}`}
						className="flex items-center justify-between py-1 px-1 rounded-md"
					>
						<span className="text-sm text-foreground">{shortcut.label}</span>
						<ShortcutKey shortcut={shortcut} />
					</div>
				))}
			</div>
		</div>
	);
}

export function ShortcutsHelpOverlay() {
	const { helpOpen, closeHelp } = useShortcuts();

	const shortcutsByCategory = SHORTCUT_CATEGORIES.map((cat) => ({
		...cat,
		shortcuts: ALL_SHORTCUTS.filter((s) => s.category === cat.id),
	}));

	return (
		<Dialog open={helpOpen} onOpenChange={(open) => !open && closeHelp()}>
			<DialogContent className={cn("sm:max-w-lg max-h-[80vh] overflow-y-auto")}>
				<DialogHeader>
					<DialogTitle>Keyboard shortcuts</DialogTitle>
					<DialogDescription>
						Navigate and manage issues using keyboard shortcuts. Press{" "}
						<kbd className="px-1 py-0.5 rounded border bg-muted font-mono text-xs">
							?
						</kbd>{" "}
						to toggle this overlay.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-6 sm:grid-cols-2 mt-2">
					{shortcutsByCategory.map((cat) => (
						<ShortcutSection
							key={cat.id}
							category={cat.id}
							label={cat.label}
							shortcuts={cat.shortcuts}
						/>
					))}
				</div>
			</DialogContent>
		</Dialog>
	);
}
