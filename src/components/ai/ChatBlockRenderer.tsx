"use client";

import { Bot, CheckSquare, HelpCircle, ListChecks, Square } from "lucide-react";
import { memo, useState } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// ── Mode Suggest Card ───────────────────────────────────────────────────

type ChatMode = "agent" | "plan" | "ask";

const MODE_META: Record<
	ChatMode,
	{ label: string; icon: typeof Bot; color: string; bg: string }
> = {
	agent: {
		label: "Agent",
		icon: Bot,
		color: "text-sienna-500",
		bg: "bg-sienna-500/10 border-sienna-500/30",
	},
	plan: {
		label: "Plan",
		icon: ListChecks,
		color: "text-blue-500",
		bg: "bg-blue-500/10 border-blue-500/30",
	},
	ask: {
		label: "Ask",
		icon: HelpCircle,
		color: "text-emerald-500",
		bg: "bg-emerald-500/10 border-emerald-500/30",
	},
};

function ModeSuggestCard({
	mode,
	description,
}: {
	mode: ChatMode;
	description: string;
}) {
	const meta = MODE_META[mode] ?? MODE_META.plan;
	const Icon = meta.icon;

	return (
		<div
			className={cn(
				"my-3 flex items-start gap-3 rounded-lg border p-3",
				meta.bg,
			)}
		>
			<div
				className={cn(
					"flex h-8 w-8 shrink-0 items-center justify-center rounded-md",
					meta.color,
					"bg-background/50",
				)}
			>
				<Icon className="h-4 w-4" />
			</div>
			<div className="flex-1 min-w-0">
				<p className="text-sm font-medium">Switch to {meta.label} mode</p>
				<p className="text-xs text-muted-foreground mt-0.5">{description}</p>
			</div>
			<Button
				variant="outline"
				size="sm"
				className={cn("h-8 px-4 shrink-0 text-xs font-medium", meta.color)}
				onClick={() => {
					window.dispatchEvent(
						new CustomEvent("clave:switch-mode", { detail: { mode } }),
					);
				}}
			>
				Switch to {meta.label}
			</Button>
		</div>
	);
}

// ── Todo List Card ──────────────────────────────────────────────────────

function TodoListCard({
	items: initialItems,
}: {
	items: { text: string; done: boolean }[];
}) {
	const [items, setItems] = useState(initialItems);
	const doneCount = items.filter((i) => i.done).length;
	const progress = items.length > 0 ? (doneCount / items.length) * 100 : 0;

	const toggle = (index: number) => {
		setItems((prev) =>
			prev.map((item, i) =>
				i === index ? { ...item, done: !item.done } : item,
			),
		);
	};

	return (
		<div className="my-3 rounded-lg border border-border/60 bg-card/50 overflow-hidden">
			{/* Progress bar */}
			<div className="h-1 bg-muted/30">
				<div
					className="h-full bg-emerald-500 transition-all duration-300"
					style={{ width: `${progress}%` }}
				/>
			</div>
			<div className="p-3">
				<div className="flex items-center gap-2 mb-2.5">
					<ListChecks className="h-4 w-4 text-sienna-500" />
					<span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
						Checklist
					</span>
					<span className="text-xs text-muted-foreground ml-auto">
						{doneCount}/{items.length} done
					</span>
				</div>
				<ul className="space-y-1">
					{items.map((item, i) => (
						<li
							key={`todo-${i}-${item.text.slice(0, 20)}`}
							className="flex items-start gap-2.5 group"
						>
							<button
								type="button"
								onClick={() => toggle(i)}
								className="mt-0.5 shrink-0 transition-colors"
							>
								{item.done ? (
									<CheckSquare className="h-4 w-4 text-emerald-500" />
								) : (
									<Square className="h-4 w-4 text-muted-foreground/40 group-hover:text-muted-foreground/70" />
								)}
							</button>
							<span
								className={cn(
									"text-sm transition-all",
									item.done && "line-through text-muted-foreground/60",
								)}
							>
								{item.text}
							</span>
						</li>
					))}
				</ul>
			</div>
		</div>
	);
}

// ── Parser ──────────────────────────────────────────────────────────────

type Block =
	| { type: "text"; content: string }
	| { type: "mode-suggest"; mode: ChatMode; description: string }
	| { type: "todo-list"; items: { text: string; done: boolean }[] };

function parseBlocks(text: string): Block[] {
	const blocks: Block[] = [];
	// Match both multiline (:::type\ncontent\n:::) and inline (:::type content:::)
	const regex = /:::(mode-suggest|todo-list)\s*([\s\S]*?):::/g;
	let lastIndex = 0;
	let hitModeSuggest = false;

	for (const match of text.matchAll(regex)) {
		// If we already hit a mode-suggest, skip everything after it
		if (hitModeSuggest) break;

		const beforeText = text.slice(lastIndex, match.index);
		if (beforeText.trim()) {
			blocks.push({ type: "text", content: beforeText });
		}

		const blockType = match[1];
		const blockContent = match[2].trim();

		if (blockType === "mode-suggest") {
			// Content format: "plan Description here" or just "plan\nDescription here"
			const words = blockContent.split(/[\s\n]+/);
			const firstWord = words[0]?.toLowerCase() ?? "";
			const validModes = ["agent", "plan", "ask"];
			let mode: ChatMode = "plan";
			let description = blockContent;

			if (validModes.includes(firstWord)) {
				mode = firstWord as ChatMode;
				description =
					words.slice(1).join(" ").trim() || `Switch to ${mode} mode`;
			}

			blocks.push({ type: "mode-suggest", mode, description });
			hitModeSuggest = true;
		} else if (blockType === "todo-list") {
			const items = blockContent
				.split("\n")
				.filter((line) => line.trim().startsWith("- ["))
				.map((line) => {
					const done = line.includes("[x]") || line.includes("[X]");
					const text = line.replace(/^-\s*\[[ xX]\]\s*/, "").trim();
					return { text, done };
				});
			if (items.length > 0) {
				blocks.push({ type: "todo-list", items });
			}
		} else {
			// Unknown block type — treat as text
			blocks.push({ type: "text", content: match[0] });
		}

		lastIndex = (match.index ?? 0) + match[0].length;
	}

	// Don't add trailing text if we hit a mode-suggest (truncate response there)
	if (!hitModeSuggest) {
		const remaining = text.slice(lastIndex);
		if (remaining.trim()) {
			blocks.push({ type: "text", content: remaining });
		}
	}

	return blocks;
}

// ── Exported check ──────────────────────────────────────────────────────

export function hasCustomBlocks(text: string): boolean {
	return /:::(mode-suggest|todo-list)/.test(text);
}

export function parseCustomBlocks(text: string): Block[] {
	return parseBlocks(text);
}

// ── Card Renderers (exported for use in MessageItem) ────────────────────

export const ModeSuggestCardRenderer = memo(function ModeSuggestCardRenderer({
	mode,
	description,
}: {
	mode: string;
	description: string;
}) {
	return <ModeSuggestCard mode={mode as ChatMode} description={description} />;
});

export const TodoListCardRenderer = memo(function TodoListCardRenderer({
	items,
}: {
	items: { text: string; done: boolean }[];
}) {
	return <TodoListCard items={items} />;
});
