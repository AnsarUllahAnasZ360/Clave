"use client";

import { Robot, Star, Users } from "@phosphor-icons/react/dist/ssr";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { cn } from "@/lib/utils";

// ── Types ────────────────────────────────────────────────────────────────

export type AgentMentionItem = {
	id: string;
	name: string;
	description: string;
	avatar?: string;
	isShared: boolean;
	isPreset: boolean;
};

export type AgentMentionListRef = {
	onKeyDown: (event: KeyboardEvent) => boolean;
};

type AgentMentionListProps = {
	items: AgentMentionItem[];
	command: (item: AgentMentionItem) => void;
};

// ── Component ────────────────────────────────────────────────────────────

export const AgentMentionList = forwardRef<
	AgentMentionListRef,
	AgentMentionListProps
>(({ items, command }, ref) => {
	const [selectedIndex, setSelectedIndex] = useState(0);

	const itemsLength = items.length;
	// biome-ignore lint/correctness/useExhaustiveDependencies: reset when results change
	useEffect(() => {
		setSelectedIndex(0);
	}, [itemsLength]);

	useImperativeHandle(ref, () => ({
		onKeyDown: (event: KeyboardEvent) => {
			if (event.key === "ArrowUp") {
				setSelectedIndex((i) => (i <= 0 ? items.length - 1 : i - 1));
				return true;
			}
			if (event.key === "ArrowDown") {
				setSelectedIndex((i) => (i >= items.length - 1 ? 0 : i + 1));
				return true;
			}
			if (event.key === "Enter") {
				const item = items[selectedIndex];
				if (item) command(item);
				return true;
			}
			return false;
		},
	}));

	if (items.length === 0) {
		return (
			<div className="rounded-lg border border-border bg-popover p-2 shadow-md">
				<p className="text-xs text-muted-foreground px-2 py-1">
					No agents found
				</p>
			</div>
		);
	}

	// Group items by type
	const personal = items.filter((i) => !i.isShared && !i.isPreset);
	const shared = items.filter((i) => i.isShared && !i.isPreset);
	const presets = items.filter((i) => i.isPreset);

	let flatIndex = 0;

	return (
		<div className="rounded-lg border border-border bg-popover shadow-md overflow-hidden max-h-[300px] overflow-y-auto w-[280px]">
			{personal.length > 0 && (
				<div>
					<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">
						Your Agents
					</p>
					{personal.map((item) => {
						const idx = flatIndex++;
						return (
							<AgentOption
								key={item.id}
								item={item}
								selected={idx === selectedIndex}
								onSelect={() => command(item)}
							/>
						);
					})}
				</div>
			)}
			{shared.length > 0 && (
				<div>
					<div className="flex items-center gap-1 px-3 pt-2 pb-1">
						<Users className="h-3 w-3 text-muted-foreground" />
						<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
							Shared
						</p>
					</div>
					{shared.map((item) => {
						const idx = flatIndex++;
						return (
							<AgentOption
								key={item.id}
								item={item}
								selected={idx === selectedIndex}
								onSelect={() => command(item)}
							/>
						);
					})}
				</div>
			)}
			{presets.length > 0 && (
				<div>
					<div className="flex items-center gap-1 px-3 pt-2 pb-1">
						<Star className="h-3 w-3 text-muted-foreground" />
						<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
							Presets
						</p>
					</div>
					{presets.map((item) => {
						const idx = flatIndex++;
						return (
							<AgentOption
								key={item.id}
								item={item}
								selected={idx === selectedIndex}
								onSelect={() => command(item)}
							/>
						);
					})}
				</div>
			)}
		</div>
	);
});

AgentMentionList.displayName = "AgentMentionList";

// ── Option Item ──────────────────────────────────────────────────────────

function AgentOption({
	item,
	selected,
	onSelect,
}: {
	item: AgentMentionItem;
	selected: boolean;
	onSelect: () => void;
}) {
	return (
		<button
			type="button"
			className={cn(
				"flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
				selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
			)}
			onMouseDown={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onSelect();
			}}
		>
			{item.avatar ? (
				<span className="text-base leading-none">{item.avatar}</span>
			) : (
				<Robot className="h-4 w-4 shrink-0 text-muted-foreground" />
			)}
			<div className="min-w-0 flex-1">
				<span className="truncate text-sm font-medium">{item.name}</span>
				<span className="ml-1.5 truncate text-xs text-muted-foreground">
					{item.description.length > 40
						? `${item.description.slice(0, 40)}...`
						: item.description}
				</span>
			</div>
		</button>
	);
}
