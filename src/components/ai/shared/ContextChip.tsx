"use client";

import {
	BarChart3,
	Briefcase,
	CheckSquare,
	CircleDashed,
	FileText,
	FolderOpen,
	Inbox,
	Kanban,
	LayoutDashboard,
	Settings,
	StickyNote,
	User,
	Users,
	X,
	Zap,
} from "lucide-react";
import { memo } from "react";
import type { AIContext } from "@/hooks/use-ai-context";

const contextConfig: Record<
	AIContext["type"],
	{ label: string; icon: typeof Briefcase }
> = {
	project: { label: "Project", icon: Briefcase },
	issue: { label: "Issue", icon: CircleDashed },
	document: { label: "Doc", icon: FileText },
	board: { label: "Board", icon: Kanban },
	client: { label: "Client", icon: User },
	tasks: { label: "My Issues", icon: CheckSquare },
	inbox: { label: "Inbox", icon: Inbox },
	analytics: { label: "Analytics", icon: BarChart3 },
	clients: { label: "Clients", icon: Users },
	settings: { label: "Settings", icon: Settings },
	notes: { label: "Notes", icon: StickyNote },
	files: { label: "Files", icon: FolderOpen },
	"projects-list": { label: "Projects", icon: Briefcase },
	"boards-list": { label: "Boards", icon: Kanban },
	"issues-list": { label: "Issues", icon: CircleDashed },
	"docs-list": { label: "Docs", icon: FileText },
	dashboard: { label: "Dashboard", icon: LayoutDashboard },
};

export const ContextChip = memo(function ContextChip({
	context,
	onClear,
}: {
	context: AIContext;
	onClear: () => void;
}) {
	const config = contextConfig[context.type] ?? {
		label: context.type,
		icon: CircleDashed,
	};
	const Icon = config.icon;

	return (
		<div className="flex items-center gap-1.5 border-b border-border/40 px-4 py-1.5">
			<div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-md bg-muted/50 px-2 py-1 text-xs text-muted-foreground">
				<Icon className="size-3 shrink-0" />
				<span className="truncate">
					{config.label}: {context.entityName}
				</span>
				<span className="inline-flex shrink-0 items-center gap-0.5 text-[10px] text-emerald-600 dark:text-emerald-400">
					<Zap className="size-2.5" />
					<span className="hidden sm:inline">Live context</span>
				</span>
			</div>
			<button
				type="button"
				onClick={onClear}
				className="flex size-11 shrink-0 items-center justify-center rounded-sm text-muted-foreground transition-colors hover:text-foreground md:size-5"
				aria-label="Clear context"
			>
				<X className="size-3" />
			</button>
		</div>
	);
});
