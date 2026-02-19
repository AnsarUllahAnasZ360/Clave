"use client";

import { FileText, PenNib } from "@phosphor-icons/react/dist/ssr";
import { forwardRef, useEffect, useImperativeHandle, useState } from "react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";

type MentionUser = { id: string; name: string; image?: string };
type MentionDoc = { id: string; title: string; projectId?: string };
type MentionBoard = { id: string; title: string; projectId?: string };

export type MentionItem =
	| { type: "user"; data: MentionUser }
	| { type: "document"; data: MentionDoc }
	| { type: "whiteboard"; data: MentionBoard };

export type MentionListRef = {
	onKeyDown: (event: KeyboardEvent) => boolean;
};

type MentionListProps = {
	items: MentionItem[];
	command: (item: MentionItem) => void;
};

export const MentionList = forwardRef<MentionListRef, MentionListProps>(
	({ items, command }, ref) => {
		const [selectedIndex, setSelectedIndex] = useState(0);

		// Reset selection to top when the items list changes (e.g. new search results)
		const itemsLength = items.length;
		// biome-ignore lint/correctness/useExhaustiveDependencies: itemsLength triggers reset when results change
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
					<p className="text-xs text-muted-foreground px-2 py-1">No results</p>
				</div>
			);
		}

		// Group items by type for display
		const users = items.filter(
			(i): i is MentionItem & { type: "user" } => i.type === "user",
		);
		const documents = items.filter(
			(i): i is MentionItem & { type: "document" } => i.type === "document",
		);
		const whiteboards = items.filter(
			(i): i is MentionItem & { type: "whiteboard" } => i.type === "whiteboard",
		);

		let flatIndex = 0;

		return (
			<div className="rounded-lg border border-border bg-popover shadow-md overflow-hidden max-h-[300px] overflow-y-auto w-[280px]">
				{users.length > 0 && (
					<div>
						<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">
							People
						</p>
						{users.map((item) => {
							const idx = flatIndex++;
							return (
								<MentionOption
									key={item.data.id}
									selected={idx === selectedIndex}
									onSelect={() => command(item)}
								>
									<Avatar className="h-5 w-5">
										<AvatarImage src={item.data.image} />
										<AvatarFallback className="text-[9px]">
											{item.data.name.charAt(0).toUpperCase()}
										</AvatarFallback>
									</Avatar>
									<span className="truncate text-sm">{item.data.name}</span>
								</MentionOption>
							);
						})}
					</div>
				)}
				{documents.length > 0 && (
					<div>
						<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">
							Documents
						</p>
						{documents.map((item) => {
							const idx = flatIndex++;
							return (
								<MentionOption
									key={item.data.id}
									selected={idx === selectedIndex}
									onSelect={() => command(item)}
								>
									<FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
									<span className="truncate text-sm">{item.data.title}</span>
								</MentionOption>
							);
						})}
					</div>
				)}
				{whiteboards.length > 0 && (
					<div>
						<p className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider px-3 pt-2 pb-1">
							Whiteboards
						</p>
						{whiteboards.map((item) => {
							const idx = flatIndex++;
							return (
								<MentionOption
									key={item.data.id}
									selected={idx === selectedIndex}
									onSelect={() => command(item)}
								>
									<PenNib className="h-4 w-4 shrink-0 text-muted-foreground" />
									<span className="truncate text-sm">{item.data.title}</span>
								</MentionOption>
							);
						})}
					</div>
				)}
			</div>
		);
	},
);

MentionList.displayName = "MentionList";

function MentionOption({
	selected,
	onSelect,
	children,
}: {
	selected: boolean;
	onSelect: () => void;
	children: React.ReactNode;
}) {
	return (
		<button
			type="button"
			className={cn(
				"flex w-full items-center gap-2 px-3 py-1.5 text-left transition-colors",
				selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
			)}
			// Use onMouseDown instead of onClick to fire before TipTap's blur
			// handler calls onExit(). This prevents the race condition where the
			// container is hidden before the click event reaches the button.
			onMouseDown={(e) => {
				e.preventDefault();
				e.stopPropagation();
				onSelect();
			}}
		>
			{children}
		</button>
	);
}
